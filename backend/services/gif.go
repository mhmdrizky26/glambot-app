package services

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"os"
	"path/filepath"
	"photobooth/config"
	"sync"
	"time"

	xdraw "golang.org/x/image/draw"
)

// Ukuran kanvas GIF — dipilih agar file tetap kecil (~500KB–1.5MB) tapi
// hasil masih nyaman dilihat di HP. Aspect ratio mengikuti frame strip
// default (464 × 696 = ~2:3) supaya komposisi tidak terpotong.
const (
	gifCanvasWidth  = 360
	gifCanvasHeight = 540
	gifFrameDelay   = 70 // 100ths of a second → 0.7s per foto raw
)

// GenerateAnimationOptions parameter generator GIF.
type GenerateAnimationOptions struct {
	SessionID        string
	SelectedRawPaths []string // path absolut ke foto raw terpilih (urut posisi)
}

// gifGenLocks per-session mutex registry. Memastikan generasi GIF untuk
// satu sessionID tidak race (request kedua menunggu request pertama).
// gifGenLocksM melindungi akses ke map itu sendiri.
var (
	gifGenLocks  = map[string]*sync.Mutex{}
	gifGenLocksM sync.Mutex
)

func sessionLock(sessionID string) *sync.Mutex {
	gifGenLocksM.Lock()
	defer gifGenLocksM.Unlock()
	mu, ok := gifGenLocks[sessionID]
	if !ok {
		mu = &sync.Mutex{}
		gifGenLocks[sessionID] = mu
	}
	return mu
}

// ForgetGifSession menghapus session lock dari peta supaya tidak menumpuk
// di memori seiring banyak sesi (kioskdi pakai berbulan-bulan).
// Dipanggil setelah session benar-benar selesai.
func ForgetGifSession(sessionID string) {
	if sessionID == "" {
		return
	}
	gifGenLocksM.Lock()
	delete(gifGenLocks, sessionID)
	gifGenLocksM.Unlock()
}

// AnimationOutputPath path file GIF hasil untuk satu sesi.
func AnimationOutputPath(sessionID string) string {
	return filepath.Join(
		config.App.StoragePath,
		"sessions", sessionID, "animation.gif",
	)
}

// GenerateSessionGIF membuat animated GIF untuk satu sesi.
// Idempotent: kalau file sudah ada dan lebih baru dari semua source,
// langsung pakai cache. Aman dipanggil ulang.
func GenerateSessionGIF(opts GenerateAnimationOptions) (string, error) {
	if opts.SessionID == "" {
		return "", fmt.Errorf("session id wajib")
	}
	if len(opts.SelectedRawPaths) == 0 {
		return "", fmt.Errorf("tidak ada foto raw untuk di-animate")
	}

	mu := sessionLock(opts.SessionID)
	mu.Lock()
	defer mu.Unlock()

	outPath := AnimationOutputPath(opts.SessionID)
	if upToDate(outPath, opts) {
		return outPath, nil
	}

	if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}

	frames := buildGIFFrames(opts)
	if len(frames.images) == 0 {
		return "", fmt.Errorf("tidak ada frame yang berhasil di-decode")
	}

	out, err := os.Create(outPath)
	if err != nil {
		return "", fmt.Errorf("create gif: %w", err)
	}
	defer out.Close()

	anim := &gif.GIF{
		Image:     frames.images,
		Delay:     frames.delays,
		LoopCount: 0, // 0 = loop forever
	}
	if err := gif.EncodeAll(out, anim); err != nil {
		return "", fmt.Errorf("encode gif: %w", err)
	}

	log.Printf("🎞️  GIF generated for session %s (%d frames) → %s",
		opts.SessionID, len(frames.images), outPath)
	return outPath, nil
}

type frameSet struct {
	images []*image.Paletted
	delays []int
}

func buildGIFFrames(opts GenerateAnimationOptions) frameSet {
	out := frameSet{}

	// Slideshow: tiap raw photo terpilih ditampilkan satu per satu, loop.
	for _, raw := range opts.SelectedRawPaths {
		img := decodeImage(raw)
		if img == nil {
			continue
		}
		frame := scaleToCanvas(img)
		out.images = append(out.images, paletted(frame))
		out.delays = append(out.delays, gifFrameDelay)
	}

	return out
}

func decodeImage(path string) image.Image {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("⚠️  gif: open %s: %v", path, err)
		return nil
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		log.Printf("⚠️  gif: decode %s: %v", path, err)
		return nil
	}
	return img
}

// scaleToCanvas mengecilkan/memperbesar src ke kanvas standar gif.
// Aspek rasio dipertahankan, sisa kanvas diisi background gelap supaya
// hasil GIF konsisten di semua HP (no letterbox abu-abu yang ganggu).
func scaleToCanvas(src image.Image) *image.RGBA {
	canvas := image.NewRGBA(image.Rect(0, 0, gifCanvasWidth, gifCanvasHeight))
	bg := color.RGBA{R: 14, G: 14, B: 18, A: 255}
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: bg}, image.Point{}, draw.Src)

	sb := src.Bounds()
	srcW := sb.Dx()
	srcH := sb.Dy()
	if srcW <= 0 || srcH <= 0 {
		return canvas
	}

	scaleW := float64(gifCanvasWidth) / float64(srcW)
	scaleH := float64(gifCanvasHeight) / float64(srcH)
	scale := scaleW
	if scaleH < scale {
		scale = scaleH
	}
	dstW := int(float64(srcW) * scale)
	dstH := int(float64(srcH) * scale)
	dstX := (gifCanvasWidth - dstW) / 2
	dstY := (gifCanvasHeight - dstH) / 2

	dstRect := image.Rect(dstX, dstY, dstX+dstW, dstY+dstH)
	xdraw.CatmullRom.Scale(canvas, dstRect, src, sb, xdraw.Over, nil)
	return canvas
}

// paletted mengkonversi RGBA ke *image.Paletted (256 colors) yang dibutuhkan
// oleh image/gif. Pakai Floyd-Steinberg dithering biar gradasi (kulit, langit)
// tidak banding parah.
func paletted(src *image.RGBA) *image.Paletted {
	bounds := src.Bounds()
	pal := standardPalette()
	dst := image.NewPaletted(bounds, pal)
	xdraw.FloydSteinberg.Draw(dst, bounds, src, bounds.Min)
	return dst
}

// standardPalette pakai websafe palette (216 warna) ditambah grayscale ramp
// dan beberapa warna kulit umum. Cukup buat foto kasual tanpa
// quantize per-frame yang lebih mahal.
var standardPaletteCache color.Palette
var standardPaletteOnce sync.Once

func standardPalette() color.Palette {
	standardPaletteOnce.Do(func() {
		p := make(color.Palette, 0, 256)
		levels := []uint8{0x00, 0x33, 0x66, 0x99, 0xCC, 0xFF}
		for _, r := range levels {
			for _, g := range levels {
				for _, b := range levels {
					p = append(p, color.RGBA{R: r, G: g, B: b, A: 0xFF})
				}
			}
		}
		// Grayscale ramp (40 levels) untuk fotografi kulit & shading.
		for i := 0; i < 40; i++ {
			v := uint8(i * 255 / 39)
			p = append(p, color.RGBA{R: v, G: v, B: v, A: 0xFF})
		}
		standardPaletteCache = p
	})
	return standardPaletteCache
}

// upToDate cek apakah GIF cache masih valid (lebih baru dari semua source).
func upToDate(outPath string, opts GenerateAnimationOptions) bool {
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
	for _, p := range opts.SelectedRawPaths {
		if !check(p) {
			return false
		}
	}
	// Jangan langsung trust cache yang umurnya 0 detik (kemungkinan baru ditulis salah)
	return time.Since(outMod) >= 100*time.Millisecond
}
