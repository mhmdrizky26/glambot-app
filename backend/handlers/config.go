package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"photobooth/database"
)

// ─── Timer config (halaman user) ─────────────────────────────────────────────
//
// Empat timer layar user yang bisa diatur admin. Disimpan di tabel app_settings
// sebagai key→value TEXT; kalau key belum ada, dipakai default di bawah.
// GET /api/config (publik) dibaca frontend saat runtime; admin mengubah via
// GET/PATCH /api/admin/settings.

const (
	keyPackageTimeout     = "package_timeout_secs"
	keySummaryTimeout     = "summary_timeout_secs"
	keyInstructionTimeout = "instruction_timeout_secs"
	keyPhotoEditorTimeout = "photo_editor_timeout_secs"
	keyGetPhotosTimeout   = "get_photos_timeout_secs"
	keyDoneScreenTimeout  = "done_screen_timeout_secs"

	// Rentang aman: cukup longgar untuk operasional, tapi cegah nilai ekstrem
	// (0 = langsung skip, atau ribuan jam).
	minTimerSecs = 5
	maxTimerSecs = 3600
)

type timerConfig struct {
	PackageTimeoutSecs     int `json:"packageTimeoutSecs"`
	SummaryTimeoutSecs     int `json:"summaryTimeoutSecs"`
	InstructionTimeoutSecs int `json:"instructionTimeoutSecs"`
	PhotoEditorTimeoutSecs int `json:"photoEditorTimeoutSecs"`
	GetPhotosTimeoutSecs   int `json:"getPhotosTimeoutSecs"`
	DoneScreenTimeoutSecs  int `json:"doneScreenTimeoutSecs"`
}

// Default = nilai hardcode lama di frontend, jadi tanpa konfigurasi apa pun
// perilaku tetap sama persis seperti sebelumnya.
var timerDefaults = timerConfig{
	PackageTimeoutSecs:     120,
	SummaryTimeoutSecs:     120,
	InstructionTimeoutSecs: 60,
	PhotoEditorTimeoutSecs: 120,
	GetPhotosTimeoutSecs:   30,
	DoneScreenTimeoutSecs:  30,
}

// loadTimerConfig membaca semua key timer dari app_settings, mengisi default
// untuk key yang belum ada / nilainya tidak valid.
func loadTimerConfig() (timerConfig, error) {
	cfg := timerDefaults

	rows, err := database.DB.Query(
		`SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?, ?)`,
		keyPackageTimeout, keySummaryTimeout, keyInstructionTimeout,
		keyPhotoEditorTimeout, keyGetPhotosTimeout, keyDoneScreenTimeout,
	)
	if err != nil {
		return cfg, err
	}
	defer rows.Close()

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		n, convErr := strconv.Atoi(v)
		if convErr != nil {
			continue // nilai rusak → biarkan default
		}
		switch k {
		case keyPackageTimeout:
			cfg.PackageTimeoutSecs = n
		case keySummaryTimeout:
			cfg.SummaryTimeoutSecs = n
		case keyInstructionTimeout:
			cfg.InstructionTimeoutSecs = n
		case keyPhotoEditorTimeout:
			cfg.PhotoEditorTimeoutSecs = n
		case keyGetPhotosTimeout:
			cfg.GetPhotosTimeoutSecs = n
		case keyDoneScreenTimeout:
			cfg.DoneScreenTimeoutSecs = n
		}
	}
	return cfg, rows.Err()
}

// GET /api/config — publik. Dibaca frontend untuk durasi timer tiap halaman.
func GetAppConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := loadTimerConfig()
	if err != nil {
		respondInternal(w, "load timer config", err)
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

// GET /api/admin/settings — sama dengan /api/config, tapi di belakang auth admin.
func AdminGetSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := loadTimerConfig()
	if err != nil {
		respondInternal(w, "load timer config", err)
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

// PATCH /api/admin/settings — update sebagian/semua timer. Field nil = tidak
// diubah. Setiap nilai divalidasi ke rentang [minTimerSecs, maxTimerSecs].
// upsertAppSettings menyimpan beberapa pasangan key/value ke tabel app_settings
// (INSERT ... ON CONFLICT DO UPDATE). Dipakai bersama oleh handler timer &
// robot-settings supaya loop upsert tidak diduplikasi.
func upsertAppSettings(updates map[string]string) error {
	for k, v := range updates {
		if _, err := database.DB.Exec(
			`INSERT INTO app_settings (key, value, updated_at)
			 VALUES (?, ?, NOW())
			 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
			k, v,
		); err != nil {
			return err
		}
	}
	return nil
}

func AdminUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PackageTimeoutSecs     *int `json:"packageTimeoutSecs"`
		SummaryTimeoutSecs     *int `json:"summaryTimeoutSecs"`
		InstructionTimeoutSecs *int `json:"instructionTimeoutSecs"`
		PhotoEditorTimeoutSecs *int `json:"photoEditorTimeoutSecs"`
		GetPhotosTimeoutSecs   *int `json:"getPhotosTimeoutSecs"`
		DoneScreenTimeoutSecs  *int `json:"doneScreenTimeoutSecs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}

	updates := map[string]int{}
	if body.PackageTimeoutSecs != nil {
		updates[keyPackageTimeout] = *body.PackageTimeoutSecs
	}
	if body.SummaryTimeoutSecs != nil {
		updates[keySummaryTimeout] = *body.SummaryTimeoutSecs
	}
	if body.InstructionTimeoutSecs != nil {
		updates[keyInstructionTimeout] = *body.InstructionTimeoutSecs
	}
	if body.PhotoEditorTimeoutSecs != nil {
		updates[keyPhotoEditorTimeout] = *body.PhotoEditorTimeoutSecs
	}
	if body.GetPhotosTimeoutSecs != nil {
		updates[keyGetPhotosTimeout] = *body.GetPhotosTimeoutSecs
	}
	if body.DoneScreenTimeoutSecs != nil {
		updates[keyDoneScreenTimeout] = *body.DoneScreenTimeoutSecs
	}

	if len(updates) == 0 {
		respondError(w, http.StatusBadRequest, "Tidak ada perubahan")
		return
	}

	for _, v := range updates {
		if v < minTimerSecs || v > maxTimerSecs {
			respondError(w, http.StatusBadRequest, fmt.Sprintf(
				"Nilai harus antara %d–%d detik", minTimerSecs, maxTimerSecs))
			return
		}
	}

	strUpdates := make(map[string]string, len(updates))
	for k, v := range updates {
		strUpdates[k] = strconv.Itoa(v)
	}
	if err := upsertAppSettings(strUpdates); err != nil {
		respondInternal(w, "update app_settings", err)
		return
	}

	cfg, err := loadTimerConfig()
	if err != nil {
		respondInternal(w, "reload timer config", err)
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}
