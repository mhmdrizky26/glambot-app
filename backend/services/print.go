package services

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// Mencetak file gambar ke printer foto FISIK yang terdeteksi OS. Sengaja
// memakai jalur print bawaan OS (bukan SDK printer vendor) supaya tidak
// bergantung pada merk tertentu — cukup untuk alur "tekan tombol → cetak".

// PrintFile mengirim file gambar ke printer fisik default sebanyak `copies`
// salinan. Dijaga ketat: hanya mencetak kalau ada printer fisik yang benar-
// benar siap (probe yang sama dengan halaman monitoring; printer virtual PDF
// sudah diabaikan di GetPrinterStatus). Mengembalikan error yang informatif
// kalau printer tidak ada/tidak siap atau perintah cetak gagal.
func PrintFile(path string, copies int) error {
	if copies < 1 {
		copies = 1
	}

	p := GetPrinterStatus()
	if !p.Found {
		return fmt.Errorf("tidak ada printer fisik terdeteksi")
	}
	if !p.Ready {
		return fmt.Errorf("printer %q belum siap (status: %s)", p.Name, p.Status)
	}

	switch runtime.GOOS {
	case "windows":
		return printWindows(path, p.Name, copies)
	default:
		return printUnix(path, p.Name, copies)
	}
}

// printWindows mencetak senyap (tanpa dialog) ke printer tertentu.
//
// PENTING: dulu pakai `mspaint /pt` tapi mspaint mencetak gambar apa adanya
// (mengikuti metadata DPI file). Export canvas dari browser tidak punya DPI
// yang benar (~96 DPI), jadi hasilnya TIDAK fit ke kertas 4R — keluar lebih
// kecil. Sekarang kita render sendiri via System.Drawing.Printing (PowerShell)
// dan men-scale gambar dengan fit-to-page (contain) supaya seluruh frame muat
// utuh di kertas tanpa ada bagian yang terpotong. Karena rasio frame 2:3 sama
// persis dengan 4R, hasilnya tetap memenuhi kertas tanpa sisa. Driver yang
// menangani N salinan via PrinterSettings.Copies, jadi cukup satu panggilan.
//
// Catatan: untuk printer foto profesional (DNP/Citizen) idealnya pakai SDK
// vendor — itu peningkatan terpisah. Jalur ini cukup untuk printer ber-driver
// standar dengan dukungan borderless 4R.
func printWindows(path, printer string, copies int) error {
	scriptPath, cleanup, err := writePrintScript()
	if err != nil {
		return fmt.Errorf("gagal menyiapkan skrip cetak: %w", err)
	}
	defer cleanup()

	// Timeout lebih longgar karena driver bisa lambat memproses; copies > 1
	// dirender driver, bukan loop di sini.
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "powershell",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", scriptPath,
		"-ImagePath", path,
		"-Printer", printer,
		"-Copies", fmt.Sprintf("%d", copies),
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("gagal mencetak %d salinan ke %q: %w (%s)",
			copies, printer, err, string(out))
	}
	return nil
}

// printScript mencetak frame ke kertas 4R: cari paper size 4x6 dari driver,
// lalu fit gambar ke KOTAK KERTAS yang terletak di tengah surface render
// (kertas fisik = PageBounds, lebih kecil dari VisibleClipBounds yang
// mengandung zona overscan borderless). Centering inilah yang bikin hasil
// pas edge-to-edge tanpa kepotong/melenceng. Tidak ada synthetic bleed.
const printScript = `param(
  [Parameter(Mandatory=$true)][string]$ImagePath,
  [Parameter(Mandatory=$true)][string]$Printer,
  [int]$Copies = 1
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($ImagePath)
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $Printer
  if (-not $doc.PrinterSettings.IsValid) { throw "Printer '$Printer' tidak valid" }
  if ($Copies -lt 1) { $Copies = 1 }
  $doc.PrinterSettings.Copies = $Copies
  $doc.DocumentName = 'Photobooth Strip'
  $doc.DefaultPageSettings.Landscape = $false

  # Pilih paper size 4R/4x6. Borderless DIUTAMAKAN supaya tidak ada strip putih
  # dari hard-margin; baru fallback ke 4x6 biasa kalau borderless tak tersedia.
  $chosen = $null
  $fallback = $null
  foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    $isFourSix = ($ps.Width -eq 400 -and $ps.Height -eq 600) -or
                 ($ps.Width -eq 600 -and $ps.Height -eq 400) -or
                 ($ps.PaperName -match '4.*6|4R|10.*15|102.*152')
    if (-not $isFourSix) { continue }
    if ($null -eq $fallback) { $fallback = $ps }
    if ($ps.PaperName -match 'borderless|borderfree|tanpa batas|full bleed') { $chosen = $ps; break }
  }
  if ($null -eq $chosen) { $chosen = $fallback }
  if ($chosen) {
    $doc.DefaultPageSettings.PaperSize = $chosen
    Write-Output ("PaperSize: {0} ({1}x{2})" -f $chosen.PaperName, $chosen.Width, $chosen.Height)
  } else {
    Write-Output 'PaperSize: (tidak ada 4x6 cocok, pakai default driver)'
  }

  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $doc.OriginAtMargins = $false

  $doc.add_PrintPage({
    param($s, $e)
    $g = $e.Graphics
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $iw = $img.Width; $ih = $img.Height

    # PENTING — kenapa dulu kepotong di kiri-atas + putih lebar di kanan-bawah:
    # Pada printer foto borderless (mis. EPSON SL-D500) permukaan render yang
    # sesungguhnya (VisibleClipBounds, mis. 421x621) LEBIH BESAR dari kertas
    # fisik (PageBounds, 400x600) — itu zona overscan borderless. Titik (0,0)
    # Graphics ada di pojok kiri-atas SURFACE (di dalam zona overscan, di LUAR
    # kertas). Menggambar mulai (0,0) ke ukuran kertas bikin gambar melenceng ke
    # kiri-atas: tepi kiri/atas keluar kertas (kepotong), kanan/bawah kurang →
    # putih. Solusi: kertas fisik ada di TENGAH surface, jadi offset gambar
    # sebesar setengah selisih overscan, lalu fit gambar ke kotak kertas itu.
    $surf = $g.VisibleClipBounds
    $sw = $surf.Width; $sh = $surf.Height
    $pw = $e.PageBounds.Width; $ph = $e.PageBounds.Height
    $offX = ($sw - $pw) / 2; $offY = ($sh - $ph) / 2

    # Fit contain ke kotak kertas. Rasio frame 2:3 == 4R, jadi mengisi penuh
    # kertas edge-to-edge tanpa crop & tanpa strip putih.
    $scale = [Math]::Min($pw / $iw, $ph / $ih)
    $dw = $iw * $scale; $dh = $ih * $scale
    $dx = $offX + ($pw - $dw) / 2
    $dy = $offY + ($ph - $dh) / 2
    $g.DrawImage($img, $dx, $dy, $dw, $dh)

    $e.HasMorePages = $false
  })

  $doc.Print()
} finally {
  $img.Dispose()
}
`

// writePrintScript menulis skrip cetak ke file .ps1 sementara dan mengembalikan
// path-nya beserta fungsi cleanup untuk menghapusnya.
func writePrintScript() (path string, cleanup func(), err error) {
	f, err := os.CreateTemp("", "glambot-print-*.ps1")
	if err != nil {
		return "", func() {}, err
	}
	name := f.Name()
	cleanup = func() { os.Remove(name) }

	if _, err := f.WriteString(printScript); err != nil {
		f.Close()
		cleanup()
		return "", func() {}, err
	}
	if err := f.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return filepath.Clean(name), cleanup, nil
}

// printUnix mencetak via CUPS `lp`. Memaksa media 4x6 dan men-scale gambar
// mengisi penuh kertas (-o fill) supaya hasil fit ke kertas 4R, bukan keluar
// kecil di tengah.
func printUnix(path, printer string, copies int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "lp",
		"-d", printer,
		"-n", fmt.Sprintf("%d", copies),
		"-o", "media=4x6.borderless",
		"-o", "fit-to-page",
		path,
	)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("gagal mencetak ke %q via lp: %w", printer, err)
	}
	return nil
}
