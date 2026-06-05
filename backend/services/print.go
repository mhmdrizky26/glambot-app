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

// printScript adalah skrip PowerShell yang men-scale gambar agar MUAT UTUH di
// kertas 4R (tanpa terpotong) lalu mencetaknya senyap ke printer yang ditentukan.
//
//   - Memilih paper size 4R/4x6/10x15 biasa (bukan borderless) kalau tersedia.
//   - Menggambar ke PrintableArea (area cetak nyata), bukan seluruh kertas,
//     supaya bagian tepi tidak ter-clip oleh margin tak-tercetak printer.
//   - Skala fit-to-page (Min) menjaga rasio dan menjamin tidak ada yang
//     terpotong: karena canvas frame 2:3 sama dengan rasio 4R, gambar mengisi
//     area cetak nyaris penuh (paling ada border putih tipis sebesar margin).
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

  # Pilih ukuran kertas 4R (4x6 inch = 400x600 ratusan-inci). Utamakan varian
  # 4x6 BIASA (bukan borderless): mode borderless membuat driver sengaja meng-
  # overscan (memperbesar lalu memotong tepi) supaya tanpa border putih, dan itu
  # justru bikin frame kepotong. Borderless hanya dipakai kalau tidak ada 4x6
  # biasa sama sekali.
  $best = $null
  $bestBorderless = $null
  foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    $isFourSix = ($ps.Width -eq 400 -and $ps.Height -eq 600) -or
                 ($ps.Width -eq 600 -and $ps.Height -eq 400) -or
                 ($ps.PaperName -match '4.*6|4R|10.*15|102.*152')
    if (-not $isFourSix) { continue }
    if ($ps.PaperName -match 'borderless|full|no.?border|tanpa') {
      if ($null -eq $bestBorderless) { $bestBorderless = $ps }
    } elseif ($null -eq $best) {
      $best = $ps
    }
  }
  $chosen = if ($best) { $best } else { $bestBorderless }
  if ($chosen) {
    $doc.DefaultPageSettings.PaperSize = $chosen
    Write-Output ("PaperSize: {0} ({1}x{2})" -f $chosen.PaperName, $chosen.Width, $chosen.Height)
  } else {
    Write-Output 'PaperSize: (tidak ada 4x6 cocok, pakai default driver)'
  }

  # Origin di sudut kertas fisik (bukan di margin) supaya koordinat
  # PrintableArea.X/Y bisa dipakai langsung sebagai offset.
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $doc.OriginAtMargins = $false

  $doc.add_PrintPage({
    param($s, $e)
    # Pakai AREA CETAK NYATA, bukan seluruh kertas. Printer punya margin tak-
    # tercetak di tepi; kalau kita menggambar ke seluruh kertas, bagian yang
    # jatuh di margin itu ter-clip hardware dan kelihatan seperti kepotong.
    # Dengan fit ke PrintableArea, seluruh frame dijamin muat utuh (paling ada
    # border putih tipis sebesar margin printer, tapi tidak ada yang terpotong).
    $area = $e.PageSettings.PrintableArea
    $ox = $area.X; $oy = $area.Y
    $aw = $area.Width; $ah = $area.Height
    $iw = $img.Width; $ih = $img.Height
    # Fit-to-PAGE (contain): skala TERKECIL supaya seluruh gambar muat utuh.
    $scale = [Math]::Min($aw / $iw, $ah / $ih)
    $dw = $iw * $scale; $dh = $ih * $scale
    $dx = $ox + ($aw - $dw) / 2
    $dy = $oy + ($ah - $dh) / 2
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $e.Graphics.DrawImage($img, $dx, $dy, $dw, $dh)
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
