package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// POST /api/photo/upload
func UploadPhoto(w http.ResponseWriter, r *http.Request) {
	// Max 10MB per foto
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Gagal membaca form upload")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	sessionID := r.FormValue("session_id")
	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib diisi")
		return
	}

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}

	if session.Status != models.StatusPaid && session.Status != models.StatusShooting {
		respondError(w, http.StatusForbidden, "Sesi belum dibayar atau tidak dalam status foto")
		return
	}

	// Update status ke shooting kalau masih paid
	if session.Status == models.StatusPaid {
		if _, err := database.DB.Exec(`UPDATE sessions SET status = 'shooting' WHERE id = ?`, sessionID); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memperbarui status sesi")
			return
		}
	}

	// Ambil file dari form
	file, header, err := r.FormFile("photo")
	if err != nil {
		respondError(w, http.StatusBadRequest, "File foto wajib disertakan")
		return
	}
	defer file.Close()

	// Validasi ekstensi
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
		respondError(w, http.StatusBadRequest, "Hanya file JPG dan PNG yang diizinkan")
		return
	}

	// Buat folder sesi kalau belum ada
	sessionDir := filepath.Join(config.App.StoragePath, "sessions", sessionID, "raw")
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat direktori penyimpanan")
		return
	}

	// Generate nama file unik
	photoID := uuid.New().String()
	fileName := fmt.Sprintf("%s%s", photoID, ext)
	filePath := filepath.Join(sessionDir, fileName)

	// Simpan file ke disk
	dst, err := os.Create(filePath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan foto")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menulis foto")
		return
	}

	// Simpan metadata ke DB (pakai relative path)
	dbPath := fmt.Sprintf("sessions/%s/raw/%s", sessionID, fileName)
	_, err = database.DB.Exec(`
		INSERT INTO photos 
			(id, session_id, file_path, file_name, type, selected, created_at)
		VALUES 
			(?, ?, ?, ?, 'raw', 0, ?)`,
		photoID, sessionID, dbPath, fileName, time.Now().UTC(),
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan metadata foto")
		return
	}

	photo := models.Photo{
		ID:        photoID,
		SessionID: sessionID,
		FilePath:  dbPath,
		FileName:  fileName,
		Type:      models.PhotoRaw,
		Selected:  false,
		CreatedAt: time.Now(),
		URL:       fmt.Sprintf("/storage/sessions/%s/raw/%s", sessionID, fileName),
	}

	respondJSON(w, http.StatusCreated, models.SuccessResponse(photo))
}

// GET /api/photo/session/{sessionID}
// Ambil semua foto raw milik sesi ini
func GetSessionPhotos(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	rows, err := database.DB.Query(`
		SELECT 
			id, session_id, file_path, file_name, type,
			selected, COALESCE(position, 0), created_at
		FROM photos 
		WHERE session_id = ? AND type = 'raw'
		ORDER BY created_at ASC`, sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mengambil foto")
		return
	}
	defer rows.Close()

	var photos []models.Photo
	for rows.Next() {
		var p models.Photo
		var selectedInt int
		var pos int

		if err := rows.Scan(
			&p.ID, &p.SessionID, &p.FilePath, &p.FileName,
			&p.Type, &selectedInt, &pos, &p.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca data foto")
			return
		}

		p.Selected = selectedInt == 1
		if pos > 0 {
			p.Position = &pos
		}
		p.URL = "/storage/" + p.FilePath
		photos = append(photos, p)
	}

	if photos == nil {
		photos = []models.Photo{}
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membaca daftar foto")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(photos))
}

// POST /api/photo/select
// User pilih tepat 3 foto untuk dimasukkan ke strip, urutan = posisi
func SelectPhotos(w http.ResponseWriter, r *http.Request) {
	var req models.SelectPhotosRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.PhotoIDs) != 3 {
		respondError(w, http.StatusBadRequest, "Harus memilih tepat 3 foto untuk strip")
		return
	}

	// Validasi semua foto milik sesi ini
	for _, photoID := range req.PhotoIDs {
		var count int
		database.DB.QueryRow(`
			SELECT COUNT(*) FROM photos 
			WHERE id = ? AND session_id = ? AND type = 'raw'`,
			photoID, req.SessionID,
		).Scan(&count)

		if count == 0 {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("Foto %s tidak ditemukan di sesi ini", photoID))
			return
		}
	}

	if err := updateSelectedPhotos(req.SessionID, req.PhotoIDs); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan pilihan foto")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"session_id":     req.SessionID,
		"selected_count": 3,
		"photo_ids":      req.PhotoIDs,
	}))
}

// GET /api/frames
// List semua frame aktif dari DB (dengan slot data)
func GetFrames(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT id, name, file_path, thumb_url, photo_slots, canvas_width, canvas_height, slots
		FROM frames
		WHERE is_active = 1
		ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load frames")
		return
	}
	defer rows.Close()

	frames := make([]models.Frame, 0)
	for rows.Next() {
		var f models.Frame
		var slotsBytes []byte
		if err := rows.Scan(
			&f.ID, &f.Name, &f.FilePath, &f.ThumbURL,
			&f.PhotoSlots, &f.CanvasWidth, &f.CanvasHeight, &slotsBytes,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to read frames")
			return
		}
		if len(slotsBytes) > 0 {
			f.Slots = slotsBytes
		} else {
			f.Slots = []byte("[]")
		}
		frames = append(frames, f)
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to read frames")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(frames))
}

// POST /api/photo/compose
// Simpan hasil komposisi (image canvas yang sudah di-render frontend) ke storage + DB.
// Frontend export canvas (frame + foto + filter) jadi JPEG dan kirim via field "image".
// Backend tidak re-render server-side karena slot positions dinamis per-frame (di DB).
func ComposeFrame(w http.ResponseWriter, r *http.Request) {
	// Max 20MB per file (canvas export bisa besar)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Gagal membaca form compose")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	sessionID := firstNonEmpty(r.FormValue("sessionId"), r.FormValue("session_id"))
	frameID := firstNonEmpty(r.FormValue("frameId"), r.FormValue("frame_id"))
	photoIDsJSON := firstNonEmpty(r.FormValue("photoIds"), r.FormValue("photo_ids"))
	// stripFilter sudah baked-in di canvas export; field di-accept untuk forward-compat
	_ = firstNonEmpty(r.FormValue("filter"), r.FormValue("strip_filter"))

	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib diisi")
		return
	}
	if frameID == "" {
		respondError(w, http.StatusBadRequest, "frame_id wajib diisi")
		return
	}

	var photoIDs []string
	if photoIDsJSON != "" {
		if err := json.Unmarshal([]byte(photoIDsJSON), &photoIDs); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid photo_ids format")
			return
		}
	}

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}

	allowedStatus := session.Status == models.StatusShooting ||
		session.Status == models.StatusPaid ||
		session.Status == models.StatusCompleted
	if !allowedStatus {
		respondError(w, http.StatusBadRequest, "Status sesi tidak valid untuk compose")
		return
	}

	// Validasi tiap photo_id memang milik sesi ini
	for _, photoID := range photoIDs {
		var count int
		if err := database.DB.QueryRow(
			`SELECT COUNT(*) FROM photos WHERE id = ? AND session_id = ?`,
			photoID, sessionID,
		).Scan(&count); err != nil || count == 0 {
			respondError(w, http.StatusBadRequest,
				fmt.Sprintf("Foto %s tidak ditemukan", photoID))
			return
		}
	}

	// Ambil file image hasil canvas export dari frontend
	file, header, err := r.FormFile("image")
	if err != nil {
		respondError(w, http.StatusBadRequest, "File komposisi (image) wajib disertakan")
		return
	}
	defer file.Close()

	// Tentukan ekstensi dari header file (default .jpg)
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
		ext = ".jpg"
	}

	// Buat folder framed
	framedDir := filepath.Join(config.App.StoragePath, "sessions", sessionID, "framed")
	if err := os.MkdirAll(framedDir, 0755); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat direktori hasil")
		return
	}

	resultID := uuid.New().String()
	framedFileName := fmt.Sprintf("result_%s%s", resultID, ext)
	framedRelPath := fmt.Sprintf("sessions/%s/framed/%s", sessionID, framedFileName)
	framedFullPath := filepath.Join(config.App.StoragePath, framedRelPath)

	dst, err := os.Create(framedFullPath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat file hasil")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menulis file hasil")
		return
	}

	// Tandai foto yang dipilih (kalau ada)
	if len(photoIDs) > 0 {
		if err := updateSelectedPhotos(sessionID, photoIDs); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menyimpan pilihan foto")
			return
		}
	}

	// Update sesi: frame_id + status completed
	if _, err := database.DB.Exec(
		`UPDATE sessions SET frame_id = ?, status = 'completed' WHERE id = ?`,
		frameID, sessionID,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memperbarui sesi")
		return
	}

	// Simpan metadata framed ke DB
	if _, err := database.DB.Exec(`
		INSERT INTO photos (id, session_id, file_path, file_name, type, selected, created_at)
		VALUES (?, ?, ?, ?, 'framed', 1, ?)`,
		resultID, sessionID, framedRelPath, framedFileName, time.Now().UTC(),
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan metadata hasil")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"result_id":    resultID,
		"download_url": fmt.Sprintf("/api/photo/download/%s", resultID),
		"preview_url":  fmt.Sprintf("/storage/%s", framedRelPath),
		"status":       "composed",
		"message":      "Strip foto berhasil disimpan",
	}))
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// GET /api/photo/download/{photoID}
// Download foto tunggal (raw maupun framed)
func DownloadPhoto(w http.ResponseWriter, r *http.Request) {
	photoID := chi.URLParam(r, "photoID")

	var filePath, fileName string
	err := database.DB.QueryRow(`
		SELECT file_path, file_name FROM photos WHERE id = ?`, photoID,
	).Scan(&filePath, &fileName)

	if err != nil {
		respondError(w, http.StatusNotFound, "Foto tidak ditemukan")
		return
	}

	fullPath := filepath.Join(config.App.StoragePath, filePath)
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		respondError(w, http.StatusNotFound, "File foto tidak ditemukan di storage")
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(fileName)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	http.ServeFile(w, r, fullPath)
}

// GET /api/photo/session/{sessionID}/framed
// Ambil semua foto framed milik sesi
func GetFramedPhotos(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	rows, err := database.DB.Query(`
		SELECT id, session_id, file_path, file_name, type, selected, created_at
		FROM photos 
		WHERE session_id = ? AND type = 'framed'
		ORDER BY created_at DESC`, sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mengambil foto")
		return
	}
	defer rows.Close()

	var photos []models.Photo
	for rows.Next() {
		var p models.Photo
		var selectedInt int
		if err := rows.Scan(
			&p.ID, &p.SessionID, &p.FilePath,
			&p.FileName, &p.Type, &selectedInt, &p.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca data foto framed")
			return
		}
		p.Selected = selectedInt == 1
		p.URL = "/storage/" + p.FilePath
		p.DownloadURL = fmt.Sprintf("/api/photo/download/%s", p.ID)
		photos = append(photos, p)
	}

	if photos == nil {
		photos = []models.Photo{}
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membaca daftar foto framed")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(photos))
}

// ─── Helper ──────────────────────────────────────────────────────────────────

func updateSelectedPhotos(sessionID string, photoIDs []string) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}

	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	if _, err := tx.Exec(`
		UPDATE photos SET selected = 0, position = NULL
		WHERE session_id = ?`, sessionID,
	); err != nil {
		return err
	}

	for i, photoID := range photoIDs {
		pos := i + 1
		if _, err := tx.Exec(`
			UPDATE photos SET selected = 1, position = ?
			WHERE id = ? AND session_id = ?`,
			pos, photoID, sessionID,
		); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	rollback = false
	return nil
}
