package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"photobooth/models"

	"github.com/lib/pq"
)

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, models.ErrorResponse(message))
}

// respondInternal mencatat error detail ke log server lalu membalas pesan
// generik ke klien — supaya struktur DB / error internal tidak bocor ke UI.
func respondInternal(w http.ResponseWriter, context string, err error) {
	log.Printf("[error] %s: %v", context, err)
	respondError(w, http.StatusInternalServerError, "Terjadi kesalahan pada server")
}

// Kode error Postgres yang perlu dibedakan dari "error server" biasa: keduanya
// sebenarnya SALAH INPUT, bukan server rusak, jadi layak dibalas 409 + pesan
// yang bisa dimengerti admin ketimbang 500 generik.
// Lihat https://www.postgresql.org/docs/current/errcodes-appendix.html
const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
)

func isPGError(err error, code string) bool {
	var pgErr *pq.Error
	return errors.As(err, &pgErr) && string(pgErr.Code) == code
}

// respondConflict — 409 dengan pesan yang ditujukan ke admin. Detail aslinya
// tetap masuk log server untuk debugging.
func respondConflict(w http.ResponseWriter, context string, err error, message string) {
	log.Printf("[conflict] %s: %v", context, err)
	respondError(w, http.StatusConflict, message)
}
