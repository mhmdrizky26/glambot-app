package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// GET /api/package
func GetPackages(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT id, code, name, base_price, duration_secs, COALESCE(description, '')
		FROM packages
		WHERE is_active = 1
		ORDER BY sort_order ASC, code ASC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load packages")
		return
	}
	defer rows.Close()

	packages := make([]models.PackageInfo, 0)
	for rows.Next() {
		var pkg models.PackageInfo
		if err := rows.Scan(&pkg.ID, &pkg.Code, &pkg.Name, &pkg.Price, &pkg.DurationSecs, &pkg.Description); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to read packages")
			return
		}
		pkg.DurationMins = pkg.DurationSecs / 60
		packages = append(packages, pkg)
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to read packages")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(packages))
}

// POST /api/session/create
func CreateSession(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.PackageID <= 0 {
		respondError(w, http.StatusBadRequest, "Invalid package id")
		return
	}

	var pkgInfo models.PackageInfo
	err := database.DB.QueryRow(`
		SELECT id, code, name, base_price, duration_secs, COALESCE(description, '')
		FROM packages
		WHERE id = ? AND is_active = 1`, req.PackageID,
	).Scan(&pkgInfo.ID, &pkgInfo.Code, &pkgInfo.Name, &pkgInfo.Price, &pkgInfo.DurationSecs, &pkgInfo.Description)
	if err != nil {
		log.Printf("CreateSession package lookup failed: packageId=%d err=%v", req.PackageID, err)
		respondError(w, http.StatusBadRequest, "Invalid package id")
		return
	}
	pkgInfo.DurationMins = pkgInfo.DurationSecs / 60

	printUnitPrice := getPrintUnitPrice(pkgInfo.Code)

	printCount := req.PrintCount
	if printCount < 0 {
		respondError(w, http.StatusBadRequest, "Invalid print count")
		return
	}

	extraPrintCost := printCount * printUnitPrice
	finalPrice := pkgInfo.Price + extraPrintCost

	sessionID := uuid.New().String()
	now := time.Now()
	expiresAt := now.Add(time.Duration(config.App.SessionExpiryHours) * time.Hour)

	_, err = database.DB.Exec(`
		INSERT INTO sessions 
			(id, package_id, package_code, category, duration_secs, print_count, price, discount, final_price, status, created_at, expires_at)
		VALUES 
			(?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending_payment', ?, ?)`,
		sessionID,
		pkgInfo.ID,
		pkgInfo.Code,
		pkgInfo.Code,
		pkgInfo.DurationSecs,
		printCount,
		pkgInfo.Price,
		finalPrice,
		now.UTC(),
		expiresAt.UTC(),
	)
	if err != nil {
		log.Printf("CreateSession insert failed: packageId=%d packageCode=%s printCount=%d finalPrice=%d err=%v", req.PackageID, pkgInfo.Code, printCount, finalPrice, err)
		respondError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	session := models.Session{
		ID:           sessionID,
		PackageID:    pkgInfo.ID,
		PackageCode:  pkgInfo.Code,
		DurationSecs: pkgInfo.DurationSecs,
		PrintCount:   printCount,
		Price:        pkgInfo.Price,
		Discount:     0,
		FinalPrice:   finalPrice,
		Status:       models.StatusPendingPayment,
		CreatedAt:    now,
		ExpiresAt:    expiresAt,
	}

	respondJSON(w, http.StatusCreated, models.SuccessResponse(session))
}

// GET /api/session/{sessionID}
func GetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session not found")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(session))
}

// PATCH /api/session/{sessionID}/status
func UpdateSessionStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	var body struct {
		Status models.SessionStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	_, err := database.DB.Exec(
		`UPDATE sessions SET status = ? WHERE id = ?`,
		string(body.Status), sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update session")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]string{
		"session_id": sessionID,
		"status":     string(body.Status),
	}))
}

// ─── Shared helper, dipakai handler lain ─────────────────────────────────────

func GetSessionByID(id string) (*models.Session, error) {
	row := database.DB.QueryRow(`
		SELECT 
			id, package_id, package_code, duration_secs, print_count, price, discount, final_price,
			status, COALESCE(frame_id, ''), created_at, expires_at
		FROM sessions 
		WHERE id = ?`, id)

	var s models.Session
	var frameID string
	err := row.Scan(
		&s.ID,
		&s.PackageID,
		&s.PackageCode,
		&s.DurationSecs,
		&s.PrintCount,
		&s.Price,
		&s.Discount,
		&s.FinalPrice,
		&s.Status,
		&frameID,
		&s.CreatedAt,
		&s.ExpiresAt,
	)
	if err != nil {
		return nil, err
	}

	s.FrameID = frameID
	return &s, nil
}

func getPrintUnitPrice(packageCode string) int {
	switch packageCode {
	case "vip":
		return 15000
	default:
		return 0
	}
}
