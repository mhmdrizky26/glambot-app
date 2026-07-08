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

// driveInflight menjaga agar satu sesi tidak diupload bersamaan oleh dua
// goroutine (mis. compose dipanggil ulang) yang bisa membuat folder dobel.
var driveInflight sync.Map

// Orkestrasi upload aset sesi ke Google Drive. Dipanggil non-blocking setelah
// compose + GIF siap. Hasil (link folder publik) disimpan ke sessions.drive_url
// dan dipakai frontend untuk QR di halaman download.

// UploadSessionToDrive mengumpulkan semua aset sesi (strip framed, GIF, foto
// mentah terpilih) lalu mengunggahnya ke folder Drive per-sesi. Menyimpan link
// folder ke DB saat sukses. Aman dipanggil kalau Drive tidak dikonfigurasi
// (langsung no-op).
func UploadSessionToDrive(sessionID string) {
	if !services.IsDriveEnabled() {
		return
	}

	// Cegah dua upload paralel untuk sesi yang sama.
	if _, busy := driveInflight.LoadOrStore(sessionID, struct{}{}); busy {
		return
	}
	defer driveInflight.Delete(sessionID)

	// Kalau sudah pernah diupload, jangan dobel.
	var existing string
	if err := database.DB.QueryRow(
		`SELECT drive_url FROM sessions WHERE id = ?`, sessionID,
	).Scan(&existing); err == nil && existing != "" {
		return
	}

	files := collectDriveFiles(sessionID)
	if len(files) == 0 {
		log.Printf("ℹ️  drive upload skip (%s): tidak ada file", sessionID)
		return
	}

	folderName := fmt.Sprintf("Glambot %s (%s)",
		time.Now().Format("2006-01-02 15.04"), shortID(sessionID))

	ctx, cancel := services.DriveContext()
	defer cancel()

	res, err := services.UploadSessionAssets(ctx, folderName, files)
	if err != nil {
		log.Printf("⚠️  drive upload gagal (%s): %v", sessionID, err)
		return
	}

	if _, err := database.DB.Exec(
		`UPDATE sessions SET drive_url = ?, drive_folder_id = ? WHERE id = ?`,
		res.WebViewLink, res.FolderID, sessionID,
	); err != nil {
		log.Printf("⚠️  gagal simpan drive_url (%s): %v", sessionID, err)
		return
	}

	log.Printf("✅ drive upload selesai (%s): %s", sessionID, res.WebViewLink)
}

// collectDriveFiles mengumpulkan daftar file lokal yang akan diunggah, dengan
// nama tampil yang ramah. Urutan: strip → GIF → foto mentah.
func collectDriveFiles(sessionID string) []services.DriveUpload {
	var files []services.DriveUpload

	// 1) Strip framed terbaru.
	if framedRel, err := latestFramedStripRelPath(sessionID); err == nil {
		if abs, ok := safeStoragePath(framedRel); ok {
			if fileExists(abs) {
				files = append(files, services.DriveUpload{
					LocalPath: abs,
					Name:      "strip" + filepath.Ext(abs),
				})
			}
		}
	}

	// 2) GIF slideshow + live strip (kalau file-nya sudah ter-generate).
	if p := services.AnimationOutputPath(sessionID); fileExists(p) {
		files = append(files, services.DriveUpload{LocalPath: p, Name: "slideshow.gif"})
	}
	if p := services.LiveStripOutputPath(sessionID); fileExists(p) {
		files = append(files, services.DriveUpload{LocalPath: p, Name: "live-strip.gif"})
	}

	// 3) SEMUA foto mentah (urut created_at) — sengaja semua, bukan hanya yang
	// terpilih, supaya isi folder Drive sama persis dengan yang tampil di
	// halaman download (yang juga menampilkan semua foto raw).
	rawPaths := allRawRelPaths(sessionID)
	for i, rel := range rawPaths {
		if abs, ok := safeStoragePath(rel); ok && fileExists(abs) {
			files = append(files, services.DriveUpload{
				LocalPath: abs,
				Name:      fmt.Sprintf("foto-%d%s", i+1, filepath.Ext(abs)),
			})
		}
	}

	return files
}

// allRawRelPaths mengembalikan relative path SEMUA foto raw sesi (urut
// created_at ASC) — sama dengan yang ditampilkan halaman download
// (GetSessionPhotos). Berbeda dari selectedRawRelPaths (di photo.go) yang
// hanya untuk GIF (foto terpilih saja).
func allRawRelPaths(sessionID string) []string {
	var paths []string
	rows, err := database.DB.Query(`
		SELECT file_path FROM photos
		WHERE session_id = ? AND type = 'raw'
		ORDER BY created_at ASC`, sessionID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var rel string
			if rows.Scan(&rel) == nil {
				paths = append(paths, rel)
			}
		}
	}
	return paths
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
