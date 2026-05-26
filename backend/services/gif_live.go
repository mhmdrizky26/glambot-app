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
// Filename versioned (v4) supaya cached GIF dari versi compositing lama
// otomatis di-skip dan regenerate. v4 hybrid: kalau SVG punya embedded PNG
// pakai PNG itu (alpha asli → dekorasi yang nempel di area foto, mis. lampion
// di slot tops, tetap muncul di depan burst). Kalau SVG vector murni, fall
// back ke clone-and-punch dari framed strip.
func LiveStripOutputPath(sessionID string) string {
	return filepath.Join(
		config.App.StoragePath,
		"sessions", sessionID, "animation-live-v4.gif",
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
	for _, s := range opts.Slots {
		x0 := int(s.X * scaleX)
		y0 := int(s.Y * scaleY)
		x1 := int((s.X + s.Width) * scaleX)
		y1 := int((s.Y + s.Height) * scaleY)
		slotRects = append(slotRects, image.Rect(x0, y0, x1, y1))
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
		frameOverlay = buildFrameOverlay(framedScaled, slotRects)
	}

	// Pre-load burst frames per photo (decode sekali, pakai berulang).
	type loadedBurst struct {
		frames []image.Image
	}
	bursts := make([]loadedBurst, len(opts.Photos))
	totalBurstFound := 0
	for i, ph := range opts.Photos {
		for _, p := range ph.BurstFrames {
			img := decodeImage(p)
			if img != nil {
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
			if i >= len(bursts) || len(bursts[i].frames) == 0 {
				continue // slot ini pakai final photo (sudah ada di base)
			}
			// Pilih burst frame proporsional dengan progress tick.
			frames := bursts[i].frames
			idx := tick * len(frames) / liveGIFAnimTicks
			if idx >= len(frames) {
				idx = len(frames) - 1
			}
			drawCover(canvas, slot, frames[idx])
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
		// SVG tanpa embedded PNG (mis. vector murni) — caller akan fallback.
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

	// SVG asli tile PNG dua kali (kiri-half + kanan-half, ref. <rect> di SVG).
	// Replikasi disini supaya overlay match dengan rendering frontend.
	overlay := image.NewRGBA(image.Rect(0, 0, canvasW, canvasH))
	halfW := canvasW / 2
	xdraw.CatmullRom.Scale(overlay, image.Rect(0, 0, halfW, canvasH),
		pngImg, pngImg.Bounds(), xdraw.Over, nil)
	xdraw.CatmullRom.Scale(overlay, image.Rect(halfW, 0, canvasW, canvasH),
		pngImg, pngImg.Bounds(), xdraw.Over, nil)
	return overlay
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
func buildFrameOverlay(framed *image.RGBA, slotRects []image.Rectangle) *image.RGBA {
	overlay := image.NewRGBA(framed.Bounds())
	draw.Draw(overlay, overlay.Bounds(), framed, image.Point{}, draw.Src)
	transparent := color.RGBA{}
	for _, rect := range slotRects {
		clipped := rect.Intersect(overlay.Bounds())
		for y := clipped.Min.Y; y < clipped.Max.Y; y++ {
			for x := clipped.Min.X; x < clipped.Max.X; x++ {
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
