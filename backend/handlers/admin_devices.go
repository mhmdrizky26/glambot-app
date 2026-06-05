package handlers

import (
	"net/http"
	"strings"
	"time"

	"photobooth/services"
)

// Bentuk respons mengikuti interface kartu di frontend
// (features/admin/devices/components/*). Field yang tidak bisa diukur dari OS
// (mis. sisa kertas/ribbon/total print printer) dikirim sebagai nilai "kosong"
// dan ditandai N/A di UI — bukan angka palsu.

const naValue = "N/A"

type cameraStatusDTO struct {
	ID             string `json:"id"`
	Resolution     string `json:"resolution"`
	Status         string `json:"status"`
	LastActive     string `json:"lastActive"`
	ActiveDuration string `json:"activeDuration"`
	IsOnline       bool   `json:"isOnline"`
}

type printerStatusDTO struct {
	ID              string `json:"id"`
	Resolution      string `json:"resolution"`
	Status          string `json:"status"`
	LastActive      string `json:"lastActive"`
	ActiveDuration  string `json:"activeDuration"`
	TotalPrint      int    `json:"totalPrint"`
	IsOnline        bool   `json:"isOnline"`
	PaperRemaining  int    `json:"paperRemaining"`
	PaperTotal      int    `json:"paperTotal"`
	RibbonRemaining int    `json:"ribbonRemaining"`
	PaperSize       string `json:"paperSize"`
	PaperType       string `json:"paperType"`
	IsReady         bool   `json:"isReady"`
}

type robotStatusDTO struct {
	ID             string `json:"id"`
	Status         string `json:"status"`
	LastActive     string `json:"lastActive"`
	ActiveDuration string `json:"activeDuration"`
	IsOnline       bool   `json:"isOnline"`
}

type devicesResponse struct {
	Camera  cameraStatusDTO  `json:"camera"`
	Printer printerStatusDTO `json:"printer"`
	Robot   robotStatusDTO   `json:"robot"`
}

func nowStamp() string {
	return time.Now().Format("02 Jan 2006, 15:04")
}

// GET /api/admin/devices — tes koneksi nyata kamera, printer, robot.
func AdminGetDevices(w http.ResponseWriter, r *http.Request) {
	resp := devicesResponse{
		Camera:  probeCamera(),
		Printer: probePrinter(),
		Robot:   probeRobot(),
	}
	respondJSON(w, http.StatusOK, resp)
}

func probeCamera() cameraStatusDTO {
	// Hanya deteksi Canon (digiCamControl) — tanpa fallback builtin — supaya
	// "Online" benar-benar mencerminkan kamera fisik yang terhubung.
	cam, err := services.DetectCanonCamera()
	online := err == nil && cam != nil && cam.Connected

	dto := cameraStatusDTO{
		ID:             "Kamera",
		Resolution:     naValue,
		Status:         "Offline",
		LastActive:     naValue,
		ActiveDuration: naValue,
		IsOnline:       false,
	}
	if online {
		dto.ID = cam.CameraName
		dto.Status = "Active"
		dto.LastActive = nowStamp()
		dto.IsOnline = true
	}
	return dto
}

func probePrinter() printerStatusDTO {
	p := services.GetPrinterStatus()

	// Konsumabel (kertas/ribbon/total print) tidak tersedia dari print spooler
	// OS generik → 0 + ditandai N/A di UI.
	dto := printerStatusDTO{
		ID:              naValue,
		Resolution:      naValue,
		Status:          "Offline",
		LastActive:      naValue,
		ActiveDuration:  naValue,
		TotalPrint:      0,
		IsOnline:        false,
		PaperRemaining:  0,
		PaperTotal:      0,
		RibbonRemaining: 0,
		PaperSize:       naValue,
		PaperType:       naValue,
		IsReady:         false,
	}
	if p.Found {
		dto.ID = p.Name
		dto.Status = p.Status
		dto.IsOnline = p.Online
		dto.IsReady = p.Ready
		if p.Online {
			dto.LastActive = nowStamp()
		}
	}
	return dto
}

func probeRobot() robotStatusDTO {
	res := services.PingRobot()

	dto := robotStatusDTO{
		ID:             "Robot",
		Status:         "Not configured",
		LastActive:     naValue,
		ActiveDuration: naValue,
		IsOnline:       false,
	}
	if !res.Configured {
		return dto
	}
	if host := robotHost(res.URL); host != "" {
		dto.ID = host
	}
	if res.Reachable {
		dto.Status = "Active"
		dto.IsOnline = true
		dto.LastActive = nowStamp()
	} else {
		dto.Status = "Offline"
	}
	return dto
}

// robotHost mengambil host dari URL robot untuk ditampilkan sebagai ID.
func robotHost(url string) string {
	s := url
	if i := strings.Index(s, "://"); i != -1 {
		s = s[i+3:]
	}
	if i := strings.IndexAny(s, "/?"); i != -1 {
		s = s[:i]
	}
	return s
}
