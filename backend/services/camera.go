package services

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"photobooth/config"
	"runtime"
	"strings"
	"sync"
	"time"
)

var digiCamHTTPClient = &http.Client{Timeout: 8 * time.Second}

var liveFrameState = struct {
	mu   sync.Mutex
	hash [16]byte
	set  bool
}{}

// Global camera state
var cameraState = struct {
	mu         sync.RWMutex
	cameraType string // "canon" atau "builtin"
	connected  bool
}{
	cameraType: "",
	connected:  false,
}

func digiCamBaseURL() string {
	if config.App != nil {
		base := strings.TrimSpace(config.App.DigiCamBaseURL)
		if base != "" {
			return strings.TrimRight(base, "/")
		}
	}
	return "http://localhost:5513/api"
}

func digiCamGet(path string) (*http.Response, error) {
	return digiCamHTTPClient.Get(digiCamBaseURL() + path)
}

func digiCamRootURL() string {
	base := digiCamBaseURL()
	lower := strings.ToLower(base)
	if strings.HasSuffix(lower, "/api") {
		return strings.TrimSpace(base[:len(base)-4])
	}
	return base
}

func digiCamTryCommand(urls []string) error {
	var lastErr error
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}

		resp, err := digiCamHTTPClient.Get(u)
		if err != nil {
			lastErr = err
			continue
		}

		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			return nil
		}

		lastErr = fmt.Errorf("status %d", resp.StatusCode)
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("command tidak tersedia")
	}

	return lastErr
}

func digiCamReadFirstAvailable(paths []string) ([]byte, error) {
	var lastErr error

	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}

		resp, err := digiCamHTTPClient.Get(path)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			lastErr = fmt.Errorf("status %d", resp.StatusCode)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}

		if len(body) == 0 {
			lastErr = fmt.Errorf("empty body")
			continue
		}

		return body, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("no liveview endpoint available")
	}
	return nil, lastErr
}

func captureLiveFrameHash(frame []byte) {
	liveFrameState.mu.Lock()
	defer liveFrameState.mu.Unlock()
	liveFrameState.hash = md5.Sum(frame)
	liveFrameState.set = true
}

func getLastLiveFrameHash() ([16]byte, bool) {
	liveFrameState.mu.Lock()
	defer liveFrameState.mu.Unlock()
	return liveFrameState.hash, liveFrameState.set
}

type CameraStatus struct {
	Connected    bool   `json:"connected"`
	CameraName   string `json:"camera_name"`
	CameraType   string `json:"camera_type"` // "canon" atau "builtin"
	BatteryLevel string `json:"battery_level"`
}

// CheckCamera cek apakah kamera terhubung ke digiCamControl
// Jika Canon tidak terdeteksi, fallback ke builtin camera (laptop camera)
func CheckCamera() (*CameraStatus, error) {
	// Try Canon camera first
	resp, err := digiCamGet("/camera")
	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err == nil && strings.TrimSpace(string(body)) != "" {
			var result map[string]interface{}
			if json.Unmarshal(body, &result) == nil {
				name := ""
				if n, ok := result["name"].(string); ok {
					name = n
				}
				SetCameraType("canon")
				SetCameraConnected(true)
				log.Printf("📷 Canon Camera Detected: %s", name)
				return &CameraStatus{
					Connected:  true,
					CameraName: name,
					CameraType: "canon",
				}, nil
			}
		}
		resp.Body.Close()
	}

	// Fallback ke builtin camera
	log.Printf("⚠️  Canon camera tidak terdeteksi, menggunakan laptop camera (builtin)")
	SetCameraType("builtin")
	SetCameraConnected(true)

	return &CameraStatus{
		Connected:  true,
		CameraName: "Laptop Camera (Builtin)",
		CameraType: "builtin",
	}, nil
}

// TriggerCapture trigger shutter via camera yang tersedia (Canon atau Builtin)
// Jika Canon tidak tersedia, otomatis fallback ke builtin camera
func TriggerCapture(sessionID string) (string, error) {
	cameraType := GetCameraType()

	// Jika camera type belum diset, cek dulu
	if cameraType == "" {
		_, _ = CheckCamera()
		cameraType = GetCameraType()
	}

	// Gunakan builtin camera jika Canon tidak tersedia
	if cameraType == "builtin" {
		return TriggerBuiltinCapture(sessionID)
	}

	return triggerCanonCapture(sessionID)
}

// triggerCanonCapture trigger shutter Canon via digiCamControl
// Foto akan disimpan ke folder sesi
func triggerCanonCapture(sessionID string) (string, error) {
	// Buat folder sesi kalau belum ada
	sessionDir := filepath.Join(config.App.StoragePath, "sessions", sessionID, "raw")
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return "", fmt.Errorf("gagal buat direktori: %w", err)
	}

	root := digiCamRootURL()
	base := digiCamBaseURL()
	beforeHash, _ := getLastLiveFrameHash()

	// Aktifkan mode live window jika diperlukan oleh device/profile digiCamControl.
	_ = digiCamTryCommand([]string{
		root + "/?CMD=LiveViewWnd_Show",
	})

	// Trigger shutter via command endpoint yang dipakai UI digiCam remote.
	if err := digiCamTryCommand([]string{
		root + "/?CMD=LiveView_Capture",
		root + "/?CMD=Capture",
		base + "/capture", // fallback kompatibilitas setup lama
	}); err != nil {
		return "", fmt.Errorf("gagal trigger kamera: %w", err)
	}

	// Ambil frame live terbaru yang berubah setelah trigger untuk sinkronisasi preview dan hasil foto.
	frame, err := waitForFreshFrameAfterCapture(beforeHash, 2*time.Second)
	if err == nil {
		return saveCaptureFrame(sessionDir, frame)
	}

	// Fallback bila frame live tidak berubah tepat waktu.
	time.Sleep(120 * time.Millisecond)

	// Simpan snapshot terbaru non-empty sebagai hasil capture sesi.
	return downloadLastCaptured(sessionID, sessionDir)
}

func waitForFreshFrameAfterCapture(beforeHash [16]byte, timeout time.Duration) ([]byte, error) {
	deadline := time.Now().Add(timeout)

	for {
		frame, err := fetchLiveViewFrameBytes()
		if err == nil {
			h := md5.Sum(frame)
			captureLiveFrameHash(frame)
			if h != beforeHash {
				return frame, nil
			}
		}

		if time.Now().After(deadline) {
			break
		}
		time.Sleep(80 * time.Millisecond)
	}

	return nil, fmt.Errorf("timeout menunggu frame baru")
}

func saveCaptureFrame(sessionDir string, frame []byte) (string, error) {
	fileName := fmt.Sprintf("canon_%d.jpg", time.Now().UnixMilli())
	filePath := filepath.Join(sessionDir, fileName)

	f, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("gagal buat file: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(frame); err != nil {
		return "", fmt.Errorf("gagal tulis file: %w", err)
	}

	return filePath, nil
}

// downloadLastCaptured download foto terakhir dari digiCamControl
func downloadLastCaptured(sessionID, sessionDir string) (string, error) {
	root := digiCamRootURL()
	base := digiCamBaseURL()
	nonce := fmt.Sprintf("%d", time.Now().UnixNano())

	body, err := digiCamReadFirstAvailable([]string{
		root + "/liveview.jpg?_ts=" + nonce,
		root + "/preview.jpg?_ts=" + nonce,
		root + "/lastcaptured?_ts=" + nonce,
		base + "/lastcaptured?_ts=" + nonce,
	})
	if err != nil {
		return "", fmt.Errorf("gagal download foto: %w", err)
	}

	return saveCaptureFrame(sessionDir, body)
}

// GetLiveViewFrame ambil 1 frame dari live view (Canon atau Builtin)
func GetLiveViewFrame() ([]byte, error) {
	cameraType := GetCameraType()

	// Jika camera type belum diset, cek dulu
	if cameraType == "" {
		_, _ = CheckCamera()
		cameraType = GetCameraType()
	}

	// Gunakan builtin camera jika Canon tidak tersedia
	if cameraType == "builtin" {
		return GetBuiltinLiveView()
	}

	frame, err := fetchLiveViewFrameBytes()
	if err != nil {
		return nil, err
	}

	captureLiveFrameHash(frame)
	return frame, nil
}

func fetchLiveViewFrameBytes() ([]byte, error) {
	root := digiCamRootURL()
	base := digiCamBaseURL()
	nonce := fmt.Sprintf("%d", time.Now().UnixNano())

	frame, err := digiCamReadFirstAvailable([]string{
		root + "/liveview.jpg?_ts=" + nonce,
		root + "/preview.jpg?_ts=" + nonce,
		base + "/liveview?_ts=" + nonce,
	})
	if err != nil {
		return nil, fmt.Errorf("gagal ambil liveview: %w", err)
	}

	return frame, nil
}

// ─── BUILTIN CAMERA FUNCTIONS (Fallback untuk testing tanpa Canon) ─────────

// SetCameraType set tipe camera yang sedang digunakan
func SetCameraType(ctype string) {
	cameraState.mu.Lock()
	defer cameraState.mu.Unlock()
	cameraState.cameraType = strings.ToLower(ctype)
}

// GetCameraType get tipe camera saat ini
func GetCameraType() string {
	cameraState.mu.RLock()
	defer cameraState.mu.RUnlock()
	return cameraState.cameraType
}

// SetCameraConnected set status koneksi camera
func SetCameraConnected(connected bool) {
	cameraState.mu.Lock()
	defer cameraState.mu.Unlock()
	cameraState.connected = connected
}

// IsCameraConnected check apakah camera connected
func IsCameraConnected() bool {
	cameraState.mu.RLock()
	defer cameraState.mu.RUnlock()
	return cameraState.connected
}

// captureWebcamFrame capture frame dari actual laptop webcam menggunakan ffmpeg
// Device names: "video0" (Linux), "dshow:...input" (Windows), "/dev/video0" (Mac/Linux)
func captureWebcamFrame() ([]byte, error) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("webcam_%d.jpg", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	// Windows: gunakan dshow
	// Mac/Linux: gunakan /dev/video0
	var deviceInput string
	var rtFormat string

	switch runtime.GOOS {
	case "windows":
		// Windows device list (common): "Desktop Duplication Grabber", "screen-capture-recorder"
		deviceInput = "video=\"screen-capture-recorder-0\""
		rtFormat = "dshow"
	case "darwin":
		// macOS
		deviceInput = "0" // Default camera
		rtFormat = "avfoundation"
	default:
		// Linux
		deviceInput = "/dev/video0"
		rtFormat = "v4l2"
	}

	// Capture 1 frame dengan ffmpeg
	cmd := exec.Command("ffmpeg",
		"-f", rtFormat,
		"-i", deviceInput,
		"-frames:v", "1", // Capture hanya 1 frame
		"-q:v", "2", // Quality (1-31, lower = better)
		"-y", // Overwrite file
		tmpFile,
	)

	// Suppress ffmpeg output
	cmd.Stdout = nil
	cmd.Stderr = nil

	// Set timeout 2 detik untuk ffmpeg
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd = exec.CommandContext(ctx, "ffmpeg",
		"-f", rtFormat,
		"-i", deviceInput,
		"-frames:v", "1",
		"-q:v", "2",
		"-y",
		tmpFile,
	)
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Run(); err != nil {
		// Fallback ke test image jika webcam tidak tersedia
		log.Printf("⚠️  ffmpeg failed: %v, falling back to test image", err)
		return generateTestImage("")
	}

	// Baca hasil capture
	data, err := os.ReadFile(tmpFile)
	if err != nil {
		return generateTestImage("")
	}

	return data, nil
}

// generateTestImage generate test image untuk builtin camera fallback
// Lebih realistis untuk testing photo booth flow
func generateTestImage(sessionID string) ([]byte, error) {
	width, height := 1280, 720
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// Background: soft blue (camera-like background)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			// Soft blue background dengan slight gradient
			r := uint8(100 + (x / 20 % 30))
			g := uint8(150 + (y / 20 % 20))
			b := uint8(200 + ((x + y) / 40 % 40))
			img.Set(x, y, color.RGBA{r, g, b, 255})
		}
	}

	// Draw centered frame indicator (simulate face detection frame)
	frameLeft := width/2 - 200
	frameTop := height/2 - 180
	frameRight := width/2 + 200
	frameBottom := height/2 + 180

	// Draw frame border (white dashed)
	for x := frameLeft; x <= frameRight; x += 10 {
		img.Set(x, frameTop, color.RGBA{255, 255, 255, 200})
		img.Set(x, frameBottom, color.RGBA{255, 255, 255, 200})
	}
	for y := frameTop; y <= frameBottom; y += 10 {
		img.Set(frameLeft, y, color.RGBA{255, 255, 255, 200})
		img.Set(frameRight, y, color.RGBA{255, 255, 255, 200})
	}

	// Corner markers
	cornerSize := 20
	// Top left
	for i := 0; i < cornerSize; i++ {
		img.Set(frameLeft+i, frameTop, color.RGBA{0, 200, 100, 255})
		img.Set(frameLeft, frameTop+i, color.RGBA{0, 200, 100, 255})
	}
	// Top right
	for i := 0; i < cornerSize; i++ {
		img.Set(frameRight-i, frameTop, color.RGBA{0, 200, 100, 255})
		img.Set(frameRight, frameTop+i, color.RGBA{0, 200, 100, 255})
	}

	// Add text info
	drawSimpleText(img, width/2-150, height-80, "🎬 TEST IMAGE - Photo Booth", color.RGBA{255, 255, 255, 255})
	drawSimpleText(img, width/2-120, height-50, fmt.Sprintf("Timestamp: %d", time.Now().Unix()), color.RGBA{200, 200, 200, 255})

	// Encode ke JPEG
	return encodeJPEG(img)
}

// encodeJPEG encode image ke JPEG bytes
func encodeJPEG(img image.Image) ([]byte, error) {
	// Kita perlu buat file dulu untuk encode
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_img_%d.jpg", time.Now().UnixNano()))
	f, err := os.Create(tmpFile)
	if err != nil {
		return nil, err
	}
	defer func() {
		f.Close()
		os.Remove(tmpFile)
	}()

	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 85}); err != nil {
		return nil, err
	}

	f.Close()

	// Baca kembali file
	return os.ReadFile(tmpFile)
}

// drawSimpleText draw text sederhana pada image (text representation)
func drawSimpleText(img *image.RGBA, x, y int, text string, col color.Color) {
	// Simple implementation - just draw colored rectangles as placeholder
	// Dalam production, bisa pakai golang.org/x/image/font
	draw.Draw(img, image.Rect(x, y, x+len(text)*8, y+20), image.NewUniform(col), image.Point{}, draw.Over)
}

// TriggerBuiltinCapture trigger capture dari builtin camera (actual webcam)
func TriggerBuiltinCapture(sessionID string) (string, error) {
	// Buat folder sesi kalau belum ada
	sessionDir := filepath.Join(config.App.StoragePath, "sessions", sessionID, "raw")
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return "", fmt.Errorf("gagal buat direktori: %w", err)
	}

	// Capture frame dari actual webcam
	imageData, err := captureWebcamFrame()
	if err != nil {
		return "", fmt.Errorf("gagal capture webcam: %w", err)
	}

	// Simpan file
	fileName := fmt.Sprintf("builtin_%d.jpg", time.Now().UnixMilli())
	filePath := filepath.Join(sessionDir, fileName)

	if err := os.WriteFile(filePath, imageData, 0644); err != nil {
		return "", fmt.Errorf("gagal simpan foto: %w", err)
	}

	log.Printf("✅ Builtin camera capture: %s", filePath)
	return filePath, nil
}

// GetBuiltinLiveView get live view dari builtin camera (actual webcam atau fallback test image)
func GetBuiltinLiveView() ([]byte, error) {
	return captureWebcamFrame()
}
