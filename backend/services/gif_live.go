package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/png"
	"log"
	"os"
	"path/filepath"
	"photobooth/config"
	"regexp"
	"strings"
	"time"

	xdraw "golang.org/x/image/draw"
)

// GIF #2 ("animated strip"): pakai framed strip yang sudah jadi sebagai
// layer dasar, lalu overlay burst frames (liveview saat countdown) di
// posisi tiap slot. Beberapa frame terakhir tanpa overlay → settle ke
// hasil final, lalu loop.

const (
	liveGIFWidth      = 320
	liveGIFAnimTicks  = 25 // tick yang menampilkan burst overlay
	liveGIFHoldTicks  = 5  // tick terakhir tanpa overlay (settle ke final)
	liveGIFFrameDelay = 10 // 100ths sec → 0.1s per frame ≈ 10 fps
)

// LiveStripPhoto data per-slot untuk generator GIF live.
type LiveStripPhoto struct {
	PhotoID     string
	Position    int
	BurstFrames []string // path absolut burst frames (urut)
}

// LiveStripSlot koordinat slot dari frame design (kanvas asli).
type LiveStripSlot struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	// Shape: "rect" | "ellipse" | "circle". Dipakai untuk masking burst supaya
	// tidak nyembul keluar lubang non-persegi. Default rect kalau kosong.
	Shape string `json:"shape"`
}

// LiveStripOptions parameter generator GIF #2.
type LiveStripOptions struct {
	SessionID       string
	FramedImagePath string // path absolut ke framed strip (base layer)
	FrameSVGPath    string // path absolut ke SVG frame asli; opsional, dipakai
	// hanya untuk cache invalidation (kalau SVG di-update setelah GIF di-cache,
	// regenerate). Frame overlay sendiri diturunkan dari FramedImagePath.
	CanvasWidth  int // dari frames.canvas_width (mis. 464)
	CanvasHeight int // dari frames.canvas_height (mis. 696)
	Slots        []LiveStripSlot
	Photos       []LiveStripPhoto // urut sesuai position; len harus match Slots
	// Filter strip yang dipilih user (mis. "warm", "mono"). Diterapkan ke tiap
	// burst frame supaya animasi konsisten dengan hasil akhir. "" / "original"
	// = tanpa filter.
	Filter string
}

// ParseSlotsJSON decode slots JSONB dari frames table.
func ParseSlotsJSON(raw []byte) ([]LiveStripSlot, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("slots kosong")
	}
	var slots []LiveStripSlot
	if err := json.Unmarshal(raw, &slots); err != nil {
		return nil, err
	}
	return slots, nil
}

// LiveStripOutputPath path file GIF #2.
//
// Filename versioned (v10) supaya cached GIF dari versi compositing lama
// otomatis di-skip dan regenerate. v10: burst kini juga dimasking ke BENTUK
// slot (elips/lingkaran), bukan cuma transparansi frame overlay — memperbaiki
// burst yang nyembul ke sudut rect saat lubang foto dibentuk lewat clipping
// frontend (frame PNG transparan di sudut). v9: frame overlay dari SVG embed-PNG
// kini di-MIRROR di separuh kiri (replikasi transform matrix(-1 0 0 1 …) di
// SVG) supaya lubang & dekorasi align persis dengan render browser — burst
// tidak lagi bocor keluar frame. v7: (a) burst dikurung ke area transparan
// frameOverlay (lubang foto desain) sehingga tidak menimpa satu pixel pun
// dekorasi frame — benar-benar di belakang frame; (b) SEMUA slot dijamin hidup
// — slot tanpa burst sendiri pakai fallback pool, tidak ada slot yang diam
// (foto beku); (c) burst diberi filter strip yang sama dengan hasil akhir
// (warm/mono/dst) supaya warnanya konsisten. Hybrid overlay:
// kalau SVG punya embedded PNG pakai PNG itu (alpha asli → dekorasi yang nempel
// di area foto, mis. lampion di slot tops, tetap muncul di depan burst). Kalau
// SVG vector murni, fall back ke clone-and-punch dari framed strip.
func LiveStripOutputPath(sessionID string) string {
	return filepath.Join(
		config.App.StoragePath,
		"sessions", sessionID, "animation-live-v11.gif",
	)
}

// GenerateLiveStripGIF buat animated GIF dimana tiap slot di strip frame
// "hidup" dengan rentetan liveview frame sebelum settle ke foto final.
func GenerateLiveStripGIF(opts LiveStripOptions) (string, error) {
	if opts.SessionID == "" {
		return "", fmt.Errorf("session id wajib")
	}
	if opts.FramedImagePath == "" {
		return "", fmt.Errorf("framed strip path wajib")
	}
	if opts.CanvasWidth <= 0 || opts.CanvasHeight <= 0 {
		return "", fmt.Errorf("canvas dimension invalid")
	}
	if len(opts.Slots) == 0 {
		return "", fmt.Errorf("slots kosong")
	}

	// Lock per-session (reuse mutex dari gif.go) supaya tidak race dengan
	// GIF #1 generator yang menulis ke folder yang sama.
	mu := sessionLock(opts.SessionID)
	mu.Lock()
	defer mu.Unlock()

	outPath := LiveStripOutputPath(opts.SessionID)
	if liveStripCacheValid(outPath, opts) {
		return outPath, nil
	}

	framedSrc := decodeImage(opts.FramedImagePath)
	if framedSrc == nil {
		return "", fmt.Errorf("gagal decode framed strip")
	}

	// Skala output: 320 wide, tinggi proporsional dengan canvas design.
	outW := liveGIFWidth
	outH := outW * opts.CanvasHeight / opts.CanvasWidth

	framedScaled := image.NewRGBA(image.Rect(0, 0, outW, outH))
	xdraw.CatmullRom.Scale(
		framedScaled, framedScaled.Bounds(),
		framedSrc, framedSrc.Bounds(),
		xdraw.Over, nil,
	)

	// Skala koordinat slot dari design coords (canvas_width × canvas_height)
	// ke output coords.
	scaleX := float64(outW) / float64(opts.CanvasWidth)
	scaleY := float64(outH) / float64(opts.CanvasHeight)
	slotRects := make([]image.Rectangle, 0, len(opts.Slots))
	slotShapes := make([]string, 0, len(opts.Slots))
	for _, s := range opts.Slots {
		x0 := int(s.X * scaleX)
		y0 := int(s.Y * scaleY)
		x1 := int((s.X + s.Width) * scaleX)
		y1 := int((s.Y + s.Height) * scaleY)
		slotRects = append(slotRects, image.Rect(x0, y0, x1, y1))
		slotShapes = append(slotShapes, strings.ToLower(strings.TrimSpace(s.Shape)))
	}

	// Frame overlay = TOP layer yang menutup burst di area dekorasi frame.
	// Hybrid strategy:
	//   1. Coba extract PNG yang di-embed di SVG frame asli (frame-164/166/167).
	//      Hasilnya: alpha asli dari design — dekorasi yang NEMPEL di area foto
	//      (lampion menjuntai, ornament corner) tetap muncul di depan burst.
	//   2. Kalau SVG vector murni (frame-165) atau extract gagal → fall back
	//      ke clone-and-punch dari framed strip (universal, tapi kehilangan
	//      dekorasi yang nempel di slot rect).
	var frameOverlay *image.RGBA
	if opts.FrameSVGPath != "" {
		if raw := loadFrameOverlayPNG(opts.FrameSVGPath, opts.CanvasWidth, opts.CanvasHeight); raw != nil {
			frameOverlay = image.NewRGBA(image.Rect(0, 0, outW, outH))
			xdraw.CatmullRom.Scale(
				frameOverlay, frameOverlay.Bounds(),
				raw, raw.Bounds(),
				xdraw.Over, nil,
			)
		}
	}
	if frameOverlay == nil {
		frameOverlay = buildFrameOverlay(framedScaled, slotRects, slotShapes)
	}

	// Pre-load burst frames per photo (decode sekali, pakai berulang).
	type loadedBurst struct {
		frames []image.Image
	}
	bursts := make([]loadedBurst, len(opts.Photos))
	totalBurstFound := 0
	applyFilter := opts.Filter != "" && opts.Filter != "original"
	for i, ph := range opts.Photos {
		for _, p := range ph.BurstFrames {
			img := decodeImage(p)
			if img != nil {
				// Terapkan filter strip yang sama dengan hasil akhir supaya
				// burst di animasi tidak "beda warna" dengan foto final.
				if applyFilter {
					img = ApplyStripFilter(img, opts.Filter)
				}
				bursts[i].frames = append(bursts[i].frames, img)
			}
		}
		totalBurstFound += len(bursts[i].frames)
	}

	// Kalau tidak ada burst sama sekali, GIF #2 jadi tidak ada gunanya
	// (tinggal static strip). Bail out.
	if totalBurstFound == 0 {
		return "", fmt.Errorf("tidak ada burst frame untuk session %s — GIF live tidak tersedia", opts.SessionID)
	}

	// Pool burst yang tersedia → fallback supaya SETIAP slot ikut hidup, termasuk
	// slot yang fotonya tidak punya burst sendiri (jumlah foto < jumlah slot, atau
	// foto dipakai ulang di beberapa slot). Tanpa ini slot tsb akan diam (foto
	// beku) sementara slot lain beranimasi.
	fallbackPool := make([][]image.Image, 0, len(bursts))
	for i := range bursts {
		if len(bursts[i].frames) > 0 {
			fallbackPool = append(fallbackPool, bursts[i].frames)
		}
	}

	if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}

	images := make([]*image.Paletted, 0, liveGIFAnimTicks+liveGIFHoldTicks)
	delays := make([]int, 0, liveGIFAnimTicks+liveGIFHoldTicks)

	// Animasi: tick 0..liveGIFAnimTicks-1 → overlay burst di slot
	for tick := 0; tick < liveGIFAnimTicks; tick++ {
		canvas := image.NewRGBA(framedScaled.Bounds())
		draw.Draw(canvas, canvas.Bounds(), framedScaled, image.Point{}, draw.Src)

		for i, slot := range slotRects {
			// Burst milik slot sendiri kalau ada; kalau tidak, ambil dari pool
			// supaya slot tetap HIDUP (tidak ada slot yang diam).
			var frames []image.Image
			if i < len(bursts) && len(bursts[i].frames) > 0 {
				frames = bursts[i].frames
			} else if len(fallbackPool) > 0 {
				frames = fallbackPool[i%len(fallbackPool)]
			}
			if len(frames) == 0 {
				continue // benar-benar tidak ada burst sama sekali
			}
			// Pilih burst frame proporsional dengan progress tick.
			idx := tick * len(frames) / liveGIFAnimTicks
			if idx >= len(frames) {
				idx = len(frames) - 1
			}
			// Burst HANYA digambar di area lubang foto (tempat frameOverlay
			// transparan) DAN di dalam bentuk slot (oval/lingkaran). Dua masker
			// ini bersama menjaga burst: (a) tidak menimpa dekorasi frame, dan
			// (b) tidak nyembul ke sudut rect saat lubang foto dibentuk lewat
			// clipping frontend (frame PNG transparan di sudut slot).
			shape := ""
			if i < len(slotShapes) {
				shape = slotShapes[i]
			}
			drawBurstMasked(canvas, slot, shape, frames[idx], frameOverlay)
		}

		// Pasang frame design di atas burst supaya dekorasi frame (border,
		// pattern atas/bawah) tetap di depan foto burst — konsisten dengan
		// settle state yang ambil framedScaled apa adanya.
		draw.Draw(canvas, canvas.Bounds(), frameOverlay, image.Point{}, draw.Over)

		images = append(images, paletted(canvas))
		delays = append(delays, liveGIFFrameDelay)
	}

	// Hold: settle ke framed strip (overlay dilepas → foto final terlihat).
	for h := 0; h < liveGIFHoldTicks; h++ {
		images = append(images, paletted(framedScaled))
		// Frame terakhir di-hold paling lama biar terasa "selesai".
		delay := liveGIFFrameDelay
		if h == liveGIFHoldTicks-1 {
			delay = 60
		}
		delays = append(delays, delay)
	}

	out, err := os.Create(outPath)
	if err != nil {
		return "", fmt.Errorf("create gif: %w", err)
	}
	defer out.Close()

	anim := &gif.GIF{
		Image:     images,
		Delay:     delays,
		LoopCount: 0,
	}
	if err := gif.EncodeAll(out, anim); err != nil {
		return "", fmt.Errorf("encode gif: %w", err)
	}

	log.Printf("🎞️  Live strip GIF for session %s (%d frames, %d burst sources) → %s",
		opts.SessionID, len(images), totalBurstFound, outPath)
	return outPath, nil
}

// drawBurstMasked menggambar burst (cover) ke dst HANYA pada pixel di mana
// frameOverlay transparan (alpha rendah) — yaitu lubang foto desain frame.
// Pixel di mana overlay opaque (dekorasi: border, ring, ornamen) tidak ditimpa
// burst sama sekali, sehingga burst dijamin berada DI BELAKANG frame dan tidak
// memotong bagian frame mana pun, apa pun bentuk lubangnya (oval, lingkaran,
// atau bentuk tak beraturan dari PNG frame).
func drawBurstMasked(dst *image.RGBA, rect image.Rectangle, shape string, src image.Image, overlay *image.RGBA) {
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return
	}
	// Render burst ke buffer sementara seukuran rect.
	tmp := image.NewRGBA(rect)
	drawCover(tmp, rect, src)

	// Slot oval/lingkaran → burst dibatasi ke dalam elips (pakai persamaan
	// elips ternormalisasi), supaya tidak nyembul ke sudut rect.
	ellipse := shape == "ellipse" || shape == "circle"
	cx := (float64(rect.Min.X) + float64(rect.Max.X)) / 2
	cy := (float64(rect.Min.Y) + float64(rect.Max.Y)) / 2
	rx := float64(rect.Dx()) / 2
	ry := float64(rect.Dy()) / 2

	clip := rect.Intersect(dst.Bounds()).Intersect(overlay.Bounds())
	for y := clip.Min.Y; y < clip.Max.Y; y++ {
		for x := clip.Min.X; x < clip.Max.X; x++ {
			// Di luar elips slot → lewati (jaga sudut rect tetap kosong).
			if ellipse && rx > 0 && ry > 0 {
				nx := (float64(x) + 0.5 - cx) / rx
				ny := (float64(y) + 0.5 - cy) / ry
				if nx*nx+ny*ny > 1.0 {
					continue
				}
			}
			// Overlay transparan di sini = lubang foto → boleh gambar burst.
			if overlay.RGBAAt(x, y).A < 128 {
				dst.SetRGBA(x, y, tmp.RGBAAt(x, y))
			}
		}
	}
}

// drawCover scale src image ke dst di rect tertentu pakai "cover" semantics
// (penuhi rect, crop bagian yang melebar). Mirip object-fit: cover di CSS.
func drawCover(dst *image.RGBA, rect image.Rectangle, src image.Image) {
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return
	}
	sb := src.Bounds()
	if sb.Dx() <= 0 || sb.Dy() <= 0 {
		return
	}

	// Skala biar src menutupi rect.
	rectAspect := float64(rect.Dx()) / float64(rect.Dy())
	srcAspect := float64(sb.Dx()) / float64(sb.Dy())

	var srcCrop image.Rectangle
	if srcAspect > rectAspect {
		// src lebih lebar → crop horizontal
		newW := int(float64(sb.Dy()) * rectAspect)
		offX := sb.Min.X + (sb.Dx()-newW)/2
		srcCrop = image.Rect(offX, sb.Min.Y, offX+newW, sb.Max.Y)
	} else {
		// src lebih tinggi → crop vertical
		newH := int(float64(sb.Dx()) / rectAspect)
		offY := sb.Min.Y + (sb.Dy()-newH)/2
		srcCrop = image.Rect(sb.Min.X, offY, sb.Max.X, offY+newH)
	}

	xdraw.CatmullRom.Scale(dst, rect, src, srcCrop, xdraw.Over, nil)
}

// frameEmbeddedPNGRe menangkap base64 PNG yang di-embed di SVG frame asset
// (xlink:href="data:image/png;base64,..."). Frame SVG raster pakai pola dua
// <rect> yang di-fill dengan pattern image PNG yang sama; PNG itu yang punya
// transparent window di posisi foto + dekorasi yang nempel di slot tops.
var frameEmbeddedPNGRe = regexp.MustCompile(`xlink:href="data:image/png;base64,([^"]+)"`)

// loadFrameOverlayPNG extract PNG yang di-embed di SVG frame, lalu render ke
// dimensi canvas (canvasW × canvasH). Hasilnya RGBA dengan transparansi
// natural — area foto transparent, dekorasi opaque (termasuk dekorasi yang
// MENJUNTAI ke dalam slot rect, mis. lampion di top).
//
// Return nil kalau SVG vector murni (frame-165) atau decode gagal — caller
// wajib fall back ke buildFrameOverlay.
func loadFrameOverlayPNG(svgPath string, canvasW, canvasH int) *image.RGBA {
	data, err := os.ReadFile(svgPath)
	if err != nil {
		log.Printf("⚠️  frame overlay: baca SVG %s: %v", svgPath, err)
		return nil
	}
	match := frameEmbeddedPNGRe.FindSubmatch(data)
	if match == nil {
		// Bukan SVG embed-PNG. Coba decode langsung sebagai file PNG: frame yang
		// di-upload admin berupa .png penuh dengan alpha asli (window foto sudah
		// transparan). Kalau berhasil, pakai langsung sebagai overlay — di-scale
		// penuh ke canvas TANPA tiling. Hasilnya semua dekorasi (termasuk yang
		// menjuntai ke dalam slot) tampil di depan burst. Kalau gagal (SVG vector
		// murni / format lain) → caller fallback ke buildFrameOverlay.
		if pngImg, derr := png.Decode(bytes.NewReader(data)); derr == nil {
			overlay := image.NewRGBA(image.Rect(0, 0, canvasW, canvasH))
			xdraw.CatmullRom.Scale(overlay, overlay.Bounds(),
				pngImg, pngImg.Bounds(), xdraw.Over, nil)
			return overlay
		}
		// SVG vector murni (mis. frame-165): coba sibling pre-rendered PNG
		// "<base>.png" (alpha asli hasil render SVG sekali). Ini menjaga dekorasi
		// yang menjuntai ke dalam window foto (mis. lanteran) tetap tampil di
		// depan burst — fallback buildFrameOverlay tak bisa karena melubangi
		// seluruh slot. Kalau sibling tak ada → caller fallback.
		if sib := siblingOverlayPNG(svgPath); sib != "" {
			if raw, rerr := os.ReadFile(sib); rerr == nil {
				if pngImg, derr := png.Decode(bytes.NewReader(raw)); derr == nil {
					overlay := image.NewRGBA(image.Rect(0, 0, canvasW, canvasH))
					xdraw.CatmullRom.Scale(overlay, overlay.Bounds(),
						pngImg, pngImg.Bounds(), xdraw.Over, nil)
					return overlay
				}
			}
		}
		return nil
	}
	// Buang whitespace dari base64 — jaga-jaga SVG di-format multi-line.
	b64 := strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == ' ' || r == '\t' {
			return -1
		}
		return r
	}, string(match[1]))
	pngBytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		log.Printf("⚠️  frame overlay: base64 decode %s: %v", svgPath, err)
		return nil
	}
	pngImg, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		log.Printf("⚠️  frame overlay: png decode %s: %v", svgPath, err)
		return nil
	}

	// SVG asli memasang PNG di dua <rect> setengah-kanvas:
	//   - rect KANAN  : pattern apa adanya          (orientasi normal)
	//   - rect KIRI   : transform="matrix(-1 0 0 1 …)" → PNG DI-MIRROR horizontal
	// Jadi frame simetris cermin kiri-kanan. Browser render SVG ini native
	// sehingga strip biasa pas; backend WAJIB meniru mirror-nya, kalau tidak
	// sisi kiri terbalik → lubang & dekorasi geser → burst bocor keluar frame.
	overlay := image.NewRGBA(image.Rect(0, 0, canvasW, canvasH))
	halfW := canvasW / 2

	// Kanan: PNG apa adanya.
	xdraw.CatmullRom.Scale(overlay, image.Rect(halfW, 0, canvasW, canvasH),
		pngImg, pngImg.Bounds(), xdraw.Over, nil)

	// Kiri: render PNG ke buffer setengah-lebar, lalu salin ter-mirror
	// horizontal ke separuh kiri overlay (replikasi matrix(-1 0 0 1 …)).
	left := image.NewRGBA(image.Rect(0, 0, halfW, canvasH))
	xdraw.CatmullRom.Scale(left, left.Bounds(),
		pngImg, pngImg.Bounds(), xdraw.Over, nil)
	for y := 0; y < canvasH; y++ {
		for x := 0; x < halfW; x++ {
			overlay.SetRGBA(halfW-1-x, y, left.RGBAAt(x, y))
		}
	}
	return overlay
}

// siblingOverlayPNG mengembalikan path "<base>.png" di sebelah file SVG kalau
// ada — overlay hasil render SVG vector (alpha asli) yang dipakai sebagai
// pengganti fallback buildFrameOverlay. Return "" kalau bukan .svg atau tidak
// ada sibling-nya. PNG ini di-generate offline sekali dari SVG (lihat README
// frames) dan harus ikut di-deploy bersama .svg-nya.
func siblingOverlayPNG(svgPath string) string {
	if !strings.EqualFold(filepath.Ext(svgPath), ".svg") {
		return ""
	}
	sib := svgPath[:len(svgPath)-len(filepath.Ext(svgPath))] + ".png"
	if _, err := os.Stat(sib); err == nil {
		return sib
	}
	return ""
}

// buildFrameOverlay derive frame-only overlay dari framed strip yang sudah
// di-compose frontend. Caranya: clone framed strip, lalu set semua pixel di
// dalam slot rect jadi transparent. Hasilnya: area di luar slot tetap berisi
// dekorasi frame (border, pattern, ornamen) sementara area slot transparent
// → siap dipakai sebagai TOP layer supaya burst foto tampil DI BELAKANG
// dekorasi frame.
//
// Fallback: dipakai untuk SVG vector murni (frame-165) yang tidak bisa
// di-extract PNG-nya. Limitasi: dekorasi frame yang nempel DI DALAM slot rect
// (mis. lampion top) hilang — burst akan menutupi area itu.
func buildFrameOverlay(framed *image.RGBA, slotRects []image.Rectangle, slotShapes []string) *image.RGBA {
	overlay := image.NewRGBA(framed.Bounds())
	draw.Draw(overlay, overlay.Bounds(), framed, image.Point{}, draw.Src)
	transparent := color.RGBA{}
	for idx, rect := range slotRects {
		shape := ""
		if idx < len(slotShapes) {
			shape = slotShapes[idx]
		}
		ellipse := shape == "ellipse" || shape == "circle"
		cx := (float64(rect.Min.X) + float64(rect.Max.X)) / 2
		cy := (float64(rect.Min.Y) + float64(rect.Max.Y)) / 2
		rx := float64(rect.Dx()) / 2
		ry := float64(rect.Dy()) / 2
		clipped := rect.Intersect(overlay.Bounds())
		for y := clipped.Min.Y; y < clipped.Max.Y; y++ {
			for x := clipped.Min.X; x < clipped.Max.X; x++ {
				// Untuk slot oval/lingkaran, hanya lubangi pixel DI DALAM oval
				// supaya dekorasi di sudut (ornamen, ring) tetap ada di overlay
				// dan tampil di depan burst.
				if ellipse && rx > 0 && ry > 0 {
					nx := (float64(x) + 0.5 - cx) / rx
					ny := (float64(y) + 0.5 - cy) / ry
					if nx*nx+ny*ny > 1.0 {
						continue
					}
				}
				overlay.SetRGBA(x, y, transparent)
			}
		}
	}
	return overlay
}

func liveStripCacheValid(outPath string, opts LiveStripOptions) bool {
	stat, err := os.Stat(outPath)
	if err != nil {
		return false
	}
	outMod := stat.ModTime()
	check := func(p string) bool {
		if p == "" {
			return true
		}
		s, err := os.Stat(p)
		if err != nil {
			return true
		}
		return s.ModTime().Before(outMod) || s.ModTime().Equal(outMod)
	}
	if !check(opts.FramedImagePath) {
		return false
	}
	if !check(opts.FrameSVGPath) {
		return false
	}
	for _, ph := range opts.Photos {
		for _, p := range ph.BurstFrames {
			if !check(p) {
				return false
			}
		}
	}
	// Jangan langsung trust cache yang umurnya 0 detik (kemungkinan baru
	// ditulis di request paralel yang belum selesai).
	return time.Since(outMod) >= 100*time.Millisecond
}
