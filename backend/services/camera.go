package services

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"photobooth/config"
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

// digiCam URLs di-cache via sync.Once: dipanggil di hot path (liveview,
// burst, capture), tidak perlu re-parse string config tiap call.
// Config.App di-set sekali saat startup jadi cache stay valid sepanjang
// process lifetime.
var (
	digiCamURLOnce sync.Once
	digiCamBase    string
	digiCamRoot    string
)

func ensureDigiCamURLs() {
	digiCamURLOnce.Do(func() {
		base := "http://localhost:5513/api"
		if config.App != nil {
			b := strings.TrimSpace(config.App.DigiCamBaseURL)
			if b != "" {
				base = strings.TrimRight(b, "/")
			}
		}
		digiCamBase = base
		if strings.HasSuffix(strings.ToLower(base), "/api") {
			digiCamRoot = strings.TrimSpace(base[:len(base)-4])
		} else {
			digiCamRoot = base
		}
	})
}

func digiCamBaseURL() string {
	ensureDigiCamURLs()
	return digiCamBase
}

func digiCamGet(path string) (*http.Response, error) {
	return digiCamHTTPClient.Get(digiCamBaseURL() + path)
}

func digiCamRootURL() string {
	ensureDigiCamURLs()
	return digiCamRoot
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

		// Validate JPEG magic bytes (0xFF 0xD8). digiCamControl returns HTML
		// error pages or empty status payloads when the camera is missing,
		// and we don't want those to be mistaken for a valid live frame.
		if !isJPEG(body) {
			lastErr = fmt.Errorf("invalid jpeg payload")
			continue
		}

		return body, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("no liveview endpoint available")
	}
	return nil, lastErr
}

// isJPEG validates JPEG framing — SOI marker (0xFF 0xD8) at the start AND
// EOI marker (0xFF 0xD9) somewhere in the trailing bytes. SOI-only check
// let truncated camera frames (network glitch mid-MJPEG, partial liveview
// read) through; the EOI guard rejects half-frames before they're stored
// as burst frames / captures.
//
// Trailing window pakai 64 byte (bukan exact-end) supaya tetap accept
// JPEG dengan small trailer (EXIF/thumbnail/app marker setelah EOI) yang
// produced by some camera firmwares — kalau strict exact-end, satu byte
// trailer akan reject SEMUA frame dari kamera itu.
func isJPEG(b []byte) bool {
	n := len(b)
	if n < 4 {
		return false
	}
	if b[0] != 0xFF || b[1] != 0xD8 {
		return false
	}
	tail := b
	if n > 64 {
		tail = b[n-64:]
	}
	for i := 0; i < len(tail)-1; i++ {
		if tail[i] == 0xFF && tail[i+1] == 0xD9 {
			return true
		}
	}
	return false
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
	Connected  bool   `json:"connected"`
	CameraName string `json:"camera_name"`
	CameraType string `json:"camera_type"` // selalu "canon"
}

// probeCanon mengambil nama kamera (kalau endpoint /camera tersedia) lalu
// memprobe frame liveview/preview dari digiCamControl. Dipakai bersama oleh
// CheckCamera & DetectCanonCamera supaya logika probe tidak terduplikasi.
// err != nil atau frame kosong berarti Canon tidak mengirim frame valid.
func probeCanon() (cameraName string, frame []byte, err error) {
	cameraName = "Canon Camera"

	if resp, e := digiCamGet("/camera"); e == nil {
		if resp.StatusCode == http.StatusOK {
			if body, e := io.ReadAll(resp.Body); e == nil && strings.TrimSpace(string(body)) != "" {
				var result map[string]interface{}
				if json.Unmarshal(body, &result) == nil {
					if n, ok := result["name"].(string); ok && strings.TrimSpace(n) != "" {
						cameraName = n
					}
				}
			}
		}
		resp.Body.Close()
	}

	root := digiCamRootURL()
	nonce := fmt.Sprintf("%d", time.Now().UnixNano())
	frame, err = digiCamReadFirstAvailable([]string{
		root + "/liveview.jpg?_ts=" + nonce,
		root + "/preview.jpg?_ts=" + nonce,
	})
	return cameraName, frame, err
}

// CheckCamera cek apakah kamera Canon terhubung ke digiCamControl (probe
// liveview). Canon-only: kalau tidak ada frame valid, Connected=false (tidak
// ada lagi fallback builtin/webcam laptop).
func CheckCamera() (*CameraStatus, error) {
	cameraName, frame, err := probeCanon()
	if err == nil && len(frame) > 0 {
		log.Printf("📷 Canon Camera Detected: %s", cameraName)
		return &CameraStatus{
			Connected:  true,
			CameraName: cameraName,
			CameraType: "canon",
		}, nil
	}

	return &CameraStatus{
		Connected:  false,
		CameraName: "Canon Camera",
		CameraType: "canon",
	}, nil
}

// DetectCanonCamera mengecek kamera Canon via digiCamControl liveview. Dipakai
// halaman monitoring admin supaya status "Online" benar-benar berarti kamera
// Canon fisik terhubung dan mengirim frame JPEG valid. Identik dengan
// CheckCamera (yang juga Canon-only), dipisah untuk kejelasan pemanggil.
func DetectCanonCamera() (*CameraStatus, error) {
	cameraName, frame, err := probeCanon()
	if err != nil {
		return nil, fmt.Errorf("canon tidak terdeteksi: %w", err)
	}
	if len(frame) == 0 {
		return nil, fmt.Errorf("canon tidak terdeteksi: frame kosong")
	}

	return &CameraStatus{
		Connected:  true,
		CameraName: cameraName,
		CameraType: "canon",
	}, nil
}

// TriggerCapture trigger shutter Canon via digiCamControl.
func TriggerCapture(sessionID string) (string, error) {
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

// downloadLastCaptured download foto terakhir dari digiCamControl.
// sessionID di-pass dari pemanggil untuk konsistensi signature, tapi
// folder tujuan sudah lengkap di sessionDir.
func downloadLastCaptured(_ string, sessionDir string) (string, error) {
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

// GetLiveViewFrame ambil 1 frame dari live view Canon (digiCamControl).
func GetLiveViewFrame() ([]byte, error) {
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
