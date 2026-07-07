package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"photobooth/database"
	"photobooth/services"
)

// ─── Robot runtime tuning (service dobot) ────────────────────────────────────
//
// Parameter perilaku robot & gesture yang boleh diatur admin dari halaman
// Settings. Disimpan di tabel app_settings (key→value TEXT) — sama seperti timer
// config. Kalau key belum ada, dipakai default di bawah (identik dengan nilai
// .env dobot, jadi tanpa konfigurasi apa pun perilaku tetap sama).
//
// Alur: PATCH /api/admin/robot-settings → simpan ke DB → best-effort forward ke
// service dobot (POST /config/runtime) agar berlaku live tanpa restart. Service
// dobot juga GET /api/robot-settings saat start supaya override tetap konsisten
// setelah restart. GET publik dipakai dobot; GET admin di belakang auth.

const (
	keyRobotSpeedFactor     = "robot_speed_factor"
	keyRobotJointSpeed      = "robot_joint_speed"
	keyRobotJointAcc        = "robot_joint_acc"
	keySafetyHoldSec        = "safety_hold_sec"
	keySafetyTimeout        = "safety_timeout"
	keyPresetDebounceFrames = "preset_debounce_frames"
	keyPostActionDelay      = "post_action_delay"
)

// robotSettings — bentuk JSON yang dipertukarkan dengan frontend & dobot
// (camelCase). Speed factor bertipe int (skala 1–100); timing bertipe float
// detik/frame.
type robotSettings struct {
	RobotSpeedFactor     int     `json:"robotSpeedFactor"`
	RobotJointSpeed      int     `json:"robotJointSpeed"`
	RobotJointAcc        int     `json:"robotJointAcc"`
	SafetyHoldSec        float64 `json:"safetyHoldSec"`
	SafetyTimeout        float64 `json:"safetyTimeout"`
	PresetDebounceFrames int     `json:"presetDebounceFrames"`
	PostActionDelay      float64 `json:"postActionDelay"`
}

// Default = nilai .env dobot. Menjaga perilaku identik saat DB kosong.
var robotDefaults = robotSettings{
	RobotSpeedFactor:     100,
	RobotJointSpeed:      80,
	RobotJointAcc:        30,
	SafetyHoldSec:        1.5,
	SafetyTimeout:        10,
	PresetDebounceFrames: 30,
	PostActionDelay:      0.5,
}

// Rentang aman per field — cegah nilai ekstrem yang bisa membuat robot terlalu
// agresif atau FSM macet. Min/max inklusif.
type robotRange struct{ min, max float64 }

var robotRanges = map[string]robotRange{
	keyRobotSpeedFactor:     {1, 100},
	keyRobotJointSpeed:      {1, 100},
	keyRobotJointAcc:        {1, 100},
	keySafetyHoldSec:        {0.5, 10},
	keySafetyTimeout:        {3, 60},
	keyPresetDebounceFrames: {5, 120},
	keyPostActionDelay:      {0, 5},
}

// loadRobotSettings membaca semua key dari app_settings, mengisi default untuk
// key yang belum ada / nilainya rusak.
func loadRobotSettings() (robotSettings, error) {
	cfg := robotDefaults

	rows, err := database.DB.Query(
		`SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?, ?, ?)`,
		keyRobotSpeedFactor, keyRobotJointSpeed, keyRobotJointAcc,
		keySafetyHoldSec, keySafetyTimeout, keyPresetDebounceFrames,
		keyPostActionDelay,
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
		f, convErr := strconv.ParseFloat(v, 64)
		if convErr != nil {
			continue // nilai rusak → biarkan default
		}
		switch k {
		case keyRobotSpeedFactor:
			cfg.RobotSpeedFactor = int(f)
		case keyRobotJointSpeed:
			cfg.RobotJointSpeed = int(f)
		case keyRobotJointAcc:
			cfg.RobotJointAcc = int(f)
		case keySafetyHoldSec:
			cfg.SafetyHoldSec = f
		case keySafetyTimeout:
			cfg.SafetyTimeout = f
		case keyPresetDebounceFrames:
			cfg.PresetDebounceFrames = int(f)
		case keyPostActionDelay:
			cfg.PostActionDelay = f
		}
	}
	return cfg, rows.Err()
}

// GetRobotSettings — GET publik & admin. Publik dipakai service dobot saat start
// untuk mengambil override; admin (di belakang auth) dipakai halaman Settings.
func GetRobotSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := loadRobotSettings()
	if err != nil {
		respondInternal(w, "load robot settings", err)
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

// AdminUpdateRobotSettings — PATCH sebagian/semua field. Field nil = tidak
// diubah. Nilai divalidasi ke rentang masing-masing, disimpan ke DB, lalu
// diteruskan best-effort ke service dobot agar berlaku live.
func AdminUpdateRobotSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RobotSpeedFactor     *float64 `json:"robotSpeedFactor"`
		RobotJointSpeed      *float64 `json:"robotJointSpeed"`
		RobotJointAcc        *float64 `json:"robotJointAcc"`
		SafetyHoldSec        *float64 `json:"safetyHoldSec"`
		SafetyTimeout        *float64 `json:"safetyTimeout"`
		PresetDebounceFrames *float64 `json:"presetDebounceFrames"`
		PostActionDelay      *float64 `json:"postActionDelay"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}

	// Field int disimpan sebagai integer; field float dengan desimal apa adanya.
	updates := map[string]string{}
	intField := func(key string, ptr *float64) bool {
		if ptr == nil {
			return true
		}
		rng := robotRanges[key]
		if *ptr < rng.min || *ptr > rng.max {
			respondError(w, http.StatusBadRequest, fmt.Sprintf(
				"%s harus antara %g–%g", key, rng.min, rng.max))
			return false
		}
		updates[key] = strconv.Itoa(int(*ptr))
		return true
	}
	floatField := func(key string, ptr *float64) bool {
		if ptr == nil {
			return true
		}
		rng := robotRanges[key]
		if *ptr < rng.min || *ptr > rng.max {
			respondError(w, http.StatusBadRequest, fmt.Sprintf(
				"%s harus antara %g–%g", key, rng.min, rng.max))
			return false
		}
		updates[key] = strconv.FormatFloat(*ptr, 'g', -1, 64)
		return true
	}

	if !intField(keyRobotSpeedFactor, body.RobotSpeedFactor) ||
		!intField(keyRobotJointSpeed, body.RobotJointSpeed) ||
		!intField(keyRobotJointAcc, body.RobotJointAcc) ||
		!intField(keyPresetDebounceFrames, body.PresetDebounceFrames) ||
		!floatField(keySafetyHoldSec, body.SafetyHoldSec) ||
		!floatField(keySafetyTimeout, body.SafetyTimeout) ||
		!floatField(keyPostActionDelay, body.PostActionDelay) {
		return
	}

	if len(updates) == 0 {
		respondError(w, http.StatusBadRequest, "Tidak ada perubahan")
		return
	}

	for k, v := range updates {
		if _, err := database.DB.Exec(
			`INSERT INTO app_settings (key, value, updated_at)
			 VALUES (?, ?, NOW())
			 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
			k, v,
		); err != nil {
			respondInternal(w, "update app_settings", err)
			return
		}
	}

	cfg, err := loadRobotSettings()
	if err != nil {
		respondInternal(w, "reload robot settings", err)
		return
	}

	// Best-effort: teruskan ke service dobot agar berlaku live. Kegagalan di sini
	// TIDAK menggagalkan request — nilai sudah tersimpan di DB dan akan terpasang
	// saat dobot start berikutnya (atau di-forward ulang saat disimpan lagi).
	if payload, mErr := json.Marshal(cfg); mErr == nil {
		if fErr := services.UpdateRobotRuntimeConfig(payload); fErr != nil {
			log.Printf("⚠️  Forward robot settings ke dobot gagal (tersimpan di DB): %v", fErr)
		}
	}

	respondJSON(w, http.StatusOK, cfg)
}
