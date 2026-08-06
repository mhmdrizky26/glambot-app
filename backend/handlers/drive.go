package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"photobooth/database"
	"photobooth/models"
	"photobooth/services"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// driveInflight menjaga agar FINALIZE satu sesi tidak jalan bersamaan oleh dua
// goroutine (mis. compose dipanggil ulang).
var driveInflight sync.Map

// Mutex per-sesi supaya folder Drive dibuat SEKALI walau beberapa upload
// per-capture jalan paralel (tanpa ini folder bisa dobel).
var driveFolderLocks sync.Map

// Upload aset sesi ke Drive: foto full-res dikirim streaming per-capture
// (EnqueueRawPhotoUpload) & folder dibuat saat foto pertama masuk supaya QR
// siap lebih awal. UploadSessionToDrive di akhir sesi hanya mengirim strip
// framed + GIF, plus menyusulkan raw yang sempat gagal.

// driveFolderName nama folder Drive per-sesi (dibuat sekali di awal).
func driveFolderName(sessionID string) string {
	return fmt.Sprintf("Glambot %s (%s)",
		time.Now().Format("2006-01-02 15.04"), shortID(sessionID))
}

// ensureSessionDriveFolder mengembalikan folder Drive sesi, membuatnya (dan
// menyimpan drive_url + drive_folder_id ke DB) sekali kalau belum ada. Aman
// dipanggil dari banyak goroutine — pembuatan di-serialize per sesi.
func ensureSessionDriveFolder(sessionID string) (string, error) {
	// Fast path: sudah ada di DB.
	if id := storedDriveFolderID(sessionID); id != "" {
		return id, nil
	}

	lockAny, _ := driveFolderLocks.LoadOrStore(sessionID, &sync.Mutex{})
	lock := lockAny.(*sync.Mutex)
	lock.Lock()
	defer lock.Unlock()

	// Re-check setelah dapat lock (goroutine lain mungkin sudah membuat).
	if id := storedDriveFolderID(sessionID); id != "" {
		return id, nil
	}

	ctx, cancel := services.DriveContext()
	defer cancel()

	folderID, link, err := services.CreateSharedFolder(ctx, driveFolderName(sessionID))
	if err != nil {
		return "", err
	}

	if _, err := database.DB.Exec(
		`UPDATE sessions SET drive_url = ?, drive_folder_id = ? WHERE id = ?`,
		link, folderID, sessionID,
	); err != nil {
		// Folder sudah terlanjur dibuat — tetap kembalikan ID-nya supaya upload
		// bisa lanjut; hanya link QR yang mungkin belum tersimpan.
		log.Printf("⚠️  gagal simpan drive_url (%s): %v", sessionID, err)
	}
	log.Printf("📁 drive folder dibuat (%s): %s", sessionID, link)
	return folderID, nil
}

func storedDriveFolderID(sessionID string) string {
	var id string
	_ = database.DB.QueryRow(
		`SELECT drive_folder_id FROM sessions WHERE id = ?`, sessionID,
	).Scan(&id)
	return id
}

// EnqueueRawPhotoUpload mengunggah satu foto raw ke folder Drive sesi secara
// non-blocking, segera setelah foto di-capture. No-op kalau Drive tidak aktif.
func EnqueueRawPhotoUpload(sessionID, photoID, absPath string) {
	if !services.IsDriveEnabled() || sessionID == "" || photoID == "" {
		return
	}
	go uploadRawPhotoToDrive(sessionID, photoID, absPath)
}

func uploadRawPhotoToDrive(sessionID, photoID, absPath string) {
	if !fileExists(absPath) {
		return
	}
	folderID, err := ensureSessionDriveFolder(sessionID)
	if err != nil {
		log.Printf("⚠️  drive folder gagal (%s): %v — foto akan di-upload saat finalize", sessionID, err)
		return
	}

	ctx, cancel := services.DriveContext()
	defer cancel()

	name := fmt.Sprintf("foto-%d%s", rawPhotoIndex(sessionID, photoID), filepath.Ext(absPath))
	if err := services.UploadFileToFolder(ctx, folderID, services.DriveUpload{LocalPath: absPath, Name: name}); err != nil {
		log.Printf("⚠️  drive upload foto gagal (%s, %s): %v — akan dicoba lagi saat finalize", sessionID, name, err)
		return
	}

	if _, err := database.DB.Exec(
		`UPDATE photos SET drive_uploaded = TRUE WHERE id = ?`, photoID,
	); err != nil {
		log.Printf("⚠️  gagal tandai drive_uploaded (%s): %v", photoID, err)
	}
	log.Printf("☁️  drive %s terkirim (%s)", name, sessionID)
}

// rawPhotoIndex posisi 1-based foto (urut created_at) di antara foto raw sesi —
// dipakai untuk penamaan "foto-N" yang konsisten antara upload per-capture &
// finalize.
func rawPhotoIndex(sessionID, photoID string) int {
	var idx int
	_ = database.DB.QueryRow(`
		SELECT COUNT(*) FROM photos
		WHERE session_id = ? AND type = 'raw'
		  AND created_at <= (SELECT created_at FROM photos WHERE id = ?)`,
		sessionID, photoID,
	).Scan(&idx)
	if idx < 1 {
		idx = 1
	}
	return idx
}

// UploadSessionToDrive FINALIZE: dipanggil setelah compose + GIF siap. Mengirim
// artefak akhir (strip framed + GIF) ke folder sesi, plus foto raw yang belum
// sempat terkirim per-capture (jaring pengaman). Aman kalau Drive tidak aktif.
func UploadSessionToDrive(sessionID string) {
	if !services.IsDriveEnabled() {
		return
	}

	// Cegah dua finalize paralel untuk sesi yang sama.
	if _, busy := driveInflight.LoadOrStore(sessionID, struct{}{}); busy {
		return
	}
	defer driveInflight.Delete(sessionID)

	folderID, err := ensureSessionDriveFolder(sessionID)
	if err != nil {
		log.Printf("⚠️  drive finalize gagal (%s): folder — %v", sessionID, err)
		return
	}

	files := collectFinalDriveFiles(sessionID)
	if len(files) == 0 {
		return
	}

	ctx, cancel := services.DriveContext()
	defer cancel()

	// Upload paralel: satu-per-satu bikin total waktu = jumlah semua file,
	// padahal tiap upload didominasi latensi jaringan, bukan CPU. Dibatasi
	// beberapa slot saja supaya koneksi kiosk (dan kuota API Drive) tidak
	// dibanjiri — strip + 2 GIF + sisa foto raw biasanya cuma segelintir file.
	const driveUploadWorkers = 4

	sem := make(chan struct{}, driveUploadWorkers)
	var wg sync.WaitGroup

	// files[0] adalah strip framed (lihat collectFinalDriveFiles) — artefak
	// paling penting buat customer, jadi ia yang pertama merebut slot.
	for _, f := range files {
		wg.Add(1)
		go func(f finalDriveFile) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			if err := services.UploadFileToFolder(ctx, folderID, f.DriveUpload); err != nil {
				log.Printf("⚠️  drive upload gagal (%s, %s): %v", sessionID, f.Name, err)
				return
			}
			// Tandai foto raw yang tadinya belum terkirim.
			if f.PhotoID != "" {
				_, _ = database.DB.Exec(`UPDATE photos SET drive_uploaded = TRUE WHERE id = ?`, f.PhotoID)
			}
		}(f)
	}
	wg.Wait()

	log.Printf("✅ drive finalize selesai (%s, %d file)", sessionID, len(files))
}

// finalDriveFile satu file untuk tahap finalize. PhotoID diisi hanya untuk foto
// raw (supaya bisa ditandai drive_uploaded setelah sukses).
type finalDriveFile struct {
	services.DriveUpload
	PhotoID string
}

// collectFinalDriveFiles kumpulkan artefak akhir: strip + GIF, plus foto raw
// yang belum ter-upload per-capture (jaring pengaman). Penamaan foto-N mengikut
// urutan created_at supaya konsisten dengan upload streaming.
func collectFinalDriveFiles(sessionID string) []finalDriveFile {
	var files []finalDriveFile

	// 1) Strip framed terbaru.
	if framedRel, err := latestFramedStripRelPath(sessionID); err == nil {
		if abs, ok := safeStoragePath(framedRel); ok && fileExists(abs) {
			files = append(files, finalDriveFile{
				DriveUpload: services.DriveUpload{LocalPath: abs, Name: "strip" + filepath.Ext(abs)},
			})
		}
	}

	// 2) GIF slideshow + live strip (kalau sudah ter-generate).
	if p := services.AnimationOutputPath(sessionID); fileExists(p) {
		files = append(files, finalDriveFile{DriveUpload: services.DriveUpload{LocalPath: p, Name: "slideshow.gif"}})
	}
	if p := services.LiveStripOutputPath(sessionID); fileExists(p) {
		files = append(files, finalDriveFile{DriveUpload: services.DriveUpload{LocalPath: p, Name: "live-strip.gif"}})
	}

	// 3) Foto raw yang BELUM ter-upload per-capture (mis. upload sempat gagal,
	// atau Drive baru diaktifkan di tengah sesi). Index by created_at agar nama
	// "foto-N" konsisten dengan yang sudah terkirim streaming.
	rows, err := database.DB.Query(`
		SELECT id, file_path, COALESCE(drive_uploaded, FALSE)
		FROM photos
		WHERE session_id = ? AND type = 'raw'
		ORDER BY created_at ASC`, sessionID,
	)
	if err == nil {
		defer rows.Close()
		i := 0
		for rows.Next() {
			i++
			var id, rel string
			var uploaded bool
			if rows.Scan(&id, &rel, &uploaded) != nil {
				continue
			}
			if uploaded {
				continue
			}
			if abs, ok := safeStoragePath(rel); ok && fileExists(abs) {
				files = append(files, finalDriveFile{
					DriveUpload: services.DriveUpload{
						LocalPath: abs,
						Name:      fmt.Sprintf("foto-%d%s", i, filepath.Ext(abs)),
					},
					PhotoID: id,
				})
			}
		}
	}

	return files
}

// GetSessionDriveLink — GET /api/photo/session/{sessionID}/drive
// Mengembalikan {enabled, ready, url}. Frontend mem-poll endpoint ini; saat
// `ready` true, QR diarahkan ke `url` (folder Drive publik).
func GetSessionDriveLink(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib")
		return
	}

	enabled := services.IsDriveEnabled()

	var url string
	if enabled {
		_ = database.DB.QueryRow(
			`SELECT drive_url FROM sessions WHERE id = ?`, sessionID,
		).Scan(&url)
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"enabled": enabled,
		"ready":   url != "",
		"url":     url,
	}))
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}
