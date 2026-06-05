package services

import (
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// Probe device cepat untuk halaman monitoring admin. Tujuannya BENAR-BENAR
// tes koneksi nyata (bukan dummy): kamera via digiCamControl, robot via HTTP
// ping ke ROBOT_API_URL, printer via OS print spooler.

// ─── Robot ────────────────────────────────────────────────────────────────

type RobotProbeResult struct {
	Configured bool   // ROBOT_API_URL diset?
	Reachable  bool   // berhasil dihubungi?
	URL        string // base URL robot
}

var robotPingClient = &http.Client{Timeout: 4 * time.Second}

// PingRobot mengecek apakah robot API benar-benar HIDUP. Berbeda dari sekadar
// "ada respons HTTP": kita HANYA anggap online kalau /health atau / membalas
// status 2xx. Ini penting untuk tunnel ngrok-free — kalau service di belakang
// tunnel mati, ngrok tetap membalas 404/502 (bukan 2xx), jadi tidak akan
// keliru dianggap online. Header ngrok-skip-browser-warning dipasang agar
// ngrok mengembalikan status asli, bukan halaman peringatan interstisial 200.
func PingRobot() RobotProbeResult {
	base, err := robotBaseURL()
	if err != nil {
		return RobotProbeResult{Configured: false, Reachable: false}
	}

	for _, p := range []string{"/health", "/"} {
		req, err := http.NewRequest(http.MethodGet, base+p, nil)
		if err != nil {
			continue
		}
		req.Header.Set("ngrok-skip-browser-warning", "true")
		resp, err := robotPingClient.Do(req)
		if err != nil {
			continue
		}
		status := resp.StatusCode
		resp.Body.Close()
		if status >= 200 && status < 300 {
			return RobotProbeResult{Configured: true, Reachable: true, URL: base}
		}
	}
	return RobotProbeResult{Configured: true, Reachable: false, URL: base}
}

// ─── Printer ──────────────────────────────────────────────────────────────

type PrinterProbeResult struct {
	Found  bool
	Name   string
	Status string // teks status mentah dari OS
	Online bool   // tidak WorkOffline
	Ready  bool   // siap mencetak
}

// rawWinPrinter memetakan output Win32_Printer (PowerShell ConvertTo-Json).
type rawWinPrinter struct {
	Name          string `json:"Name"`
	Default       bool   `json:"Default"`
	PrinterStatus int    `json:"PrinterStatus"`
	WorkOffline   bool   `json:"WorkOffline"`
}

// isVirtualPrinter menandai printer "palsu" bawaan OS (cetak ke file, fax,
// dsb.) yang bukan printer foto fisik. Dipakai agar monitoring tidak salah
// melaporkan "Microsoft Print to PDF" sebagai printer yang siap mencetak.
func isVirtualPrinter(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return true
	}
	for _, v := range []string{
		"print to pdf",
		"xps document writer",
		"onenote",
		"fax",
		"send to onenote",
		"pdfcreator",
		"cutepdf",
	} {
		if strings.Contains(n, v) {
			return true
		}
	}
	return false
}

// Win32_Printer PrinterStatus: 3=Idle, 4=Printing, 5=Warmup → dianggap siap.
func winStatusText(code int) (string, bool) {
	switch code {
	case 3:
		return "Idle", true
	case 4:
		return "Printing", true
	case 5:
		return "Warmup", true
	case 7:
		return "Offline", false
	case 6:
		return "Stopped", false
	default:
		return "Unknown", false
	}
}

// GetPrinterStatus mendeteksi default printer dari OS print spooler.
func GetPrinterStatus() PrinterProbeResult {
	switch runtime.GOOS {
	case "windows":
		return probePrinterWindows()
	default:
		return probePrinterUnix()
	}
}

func probePrinterWindows() PrinterProbeResult {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()

	// @(...) memaksa array; ConvertTo-Json -Compress agar mudah di-parse.
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command",
		`@(Get-CimInstance Win32_Printer | Select-Object Name,Default,PrinterStatus,WorkOffline) | ConvertTo-Json -Compress`)
	out, err := cmd.Output()
	if err != nil || len(out) == 0 {
		return PrinterProbeResult{Found: false}
	}

	printers := parseWinPrinters(out)
	if len(printers) == 0 {
		return PrinterProbeResult{Found: false}
	}

	// Abaikan printer virtual (Microsoft Print to PDF, XPS, OneNote, Fax) —
	// kita hanya peduli printer foto fisik. Kalau hanya ada printer virtual,
	// anggap tidak ada printer (Found:false → ditandai Offline di UI).
	physical := make([]rawWinPrinter, 0, len(printers))
	for _, p := range printers {
		if !isVirtualPrinter(p.Name) {
			physical = append(physical, p)
		}
	}
	if len(physical) == 0 {
		return PrinterProbeResult{Found: false}
	}

	// Pilih printer default; kalau tak ada yang default, ambil pertama.
	chosen := physical[0]
	for _, p := range physical {
		if p.Default {
			chosen = p
			break
		}
	}

	statusText, ready := winStatusText(chosen.PrinterStatus)
	return PrinterProbeResult{
		Found:  true,
		Name:   strings.TrimSpace(chosen.Name),
		Status: statusText,
		Online: !chosen.WorkOffline,
		Ready:  ready && !chosen.WorkOffline,
	}
}

// parseWinPrinters menangani output yang bisa berupa array ATAU objek tunggal
// (kuirk ConvertTo-Json di PowerShell 5.1 untuk array satu elemen).
func parseWinPrinters(out []byte) []rawWinPrinter {
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, "[") {
		var arr []rawWinPrinter
		if json.Unmarshal([]byte(trimmed), &arr) == nil {
			return arr
		}
		return nil
	}
	var single rawWinPrinter
	if json.Unmarshal([]byte(trimmed), &single) == nil {
		return []rawWinPrinter{single}
	}
	return nil
}

func probePrinterUnix() PrinterProbeResult {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// lpstat -d → "system default destination: <name>"
	out, err := exec.CommandContext(ctx, "lpstat", "-d").Output()
	if err != nil {
		return PrinterProbeResult{Found: false}
	}
	line := strings.TrimSpace(string(out))
	idx := strings.LastIndex(line, ":")
	if idx == -1 {
		return PrinterProbeResult{Found: false}
	}
	name := strings.TrimSpace(line[idx+1:])
	if name == "" || strings.Contains(strings.ToLower(line), "no system default") {
		return PrinterProbeResult{Found: false}
	}
	if isVirtualPrinter(name) {
		return PrinterProbeResult{Found: false}
	}
	return PrinterProbeResult{Found: true, Name: name, Status: "Idle", Online: true, Ready: true}
}
