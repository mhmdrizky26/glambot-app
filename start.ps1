<#
    Glambot Photo Booth - one-command launcher.

    Nyalain backend (Go), frontend (Next.js), dan dobot (Python) sekaligus di
    satu window Windows Terminal (3 pane), lalu buka Chrome kiosk ke frontend
    dengan profil browser yang baru tiap start.

    Frontend defaultnya production: `npm run build` lalu `npm run start`. Tidak
    ada HMR, dan perubahan kode BARU kelihatan setelah start ulang -- tukarannya
    navigasi antar halaman instan (tidak ada compile-on-demand kayak dev mode),
    yang memang yang dimau di kiosk.

    `next build` cuma dijalankan kalau ada yang berubah. Sidik jari isi src/,
    public/, config, dan .env* disimpan di .next\.glambot-build-stamp sesudah
    build sukses; kalau sidik jarinya sama persis, build dilewati dan langsung
    `npm run start`.

        .\start.ps1                 build kalau ada perubahan, lalu start + kiosk
        .\start.ps1 -Dev            pakai `npm run dev` (HMR) buat ngoding
        .\start.ps1 -Rebuild        paksa build walau tidak ada perubahan
        .\start.ps1 -Clean          + hapus frontend\.next dulu (build dari nol)
        .\start.ps1 -NoRobot        dobot jalan tanpa hardware (--no-robot)
        .\start.ps1 -NoBrowser      jangan buka Chrome

    Parameter -Service dipakai internal: tiap pane manggil balik skrip ini
    dengan -Service backend|frontend|dobot. Jangan dipanggil manual.
#>

[CmdletBinding()]
param(
    [ValidateSet('backend', 'frontend', 'dobot')]
    [string] $Service,

    [switch] $Clean,
    [switch] $NoRobot,
    [switch] $Dev,
    [switch] $Rebuild,
    [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'

$Root         = $PSScriptRoot
$BackendDir   = Join-Path $Root 'backend'
$FrontendDir  = Join-Path $Root 'frontend'
$DobotDir     = Join-Path $Root 'dobot'
$ProfileDir   = Join-Path $env:TEMP 'glambot-kiosk-profile'

# ---------------------------------------------------------------- helpers ---

# Baca satu key dari file .env (KEY=value). Komentar dan tanda kutip dibuang.
function Get-EnvValue {
    param([string] $File, [string] $Key, [string] $Default)

    if (-not (Test-Path $File)) { return $Default }
    foreach ($line in (Get-Content $File)) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            $val = $matches[1].Trim()
            $val = ($val -split '\s+#')[0].Trim()
            $val = $val.Trim('"').Trim("'")
            if ($val) { return $val }
        }
    }
    return $Default
}

function Test-PortOpen {
    param([int] $Port)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(250)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-Port {
    param([int] $Port, [string] $Label, [int] $TimeoutSec = 90)

    Write-Host "  menunggu $Label (:$Port) " -NoNewline
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-PortOpen -Port $Port) {
            Write-Host " siap." -ForegroundColor Green
            return $true
        }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 1
    }
    Write-Host " TIMEOUT." -ForegroundColor Yellow
    return $false
}

# Bunuh apa pun yang masih pegang port. Ini penting: `go run .` di Windows
# spawn child exe, dan kalau window-nya ditutup paksa child-nya tetap hidup
# megang :8080 -> run berikutnya gagal bind tanpa pesan yang jelas.
function Stop-Port {
    param([int] $Port, [string] $Label)

    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return }

    # Sengaja bukan $pid -- itu variabel otomatis PowerShell (read-only).
    foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
        if ($procId -le 4) { continue }   # System / Idle, jangan disentuh
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        Write-Host ("  [kill] :{0} dipegang {1} (pid {2}) - {3}" -f $Port, $proc.ProcessName, $procId, $Label) -ForegroundColor DarkYellow
        try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {
            Write-Host ("  [!] gagal kill pid {0}: {1}" -f $procId, $_.Exception.Message) -ForegroundColor Red
        }
    }
    Start-Sleep -Milliseconds 400
}

function Find-Chrome {
    $candidates = @(
        (Join-Path $env:ProgramFiles        'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA        'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles        'Microsoft\Edge\Application\msedge.exe')
    )
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
    return $null
}

# Sidik jari dari semua input yang mempengaruhi hasil `next build`. Dipakai
# buat nentuin apakah build boleh dilewati.
#
# Yang di-hash bukan cuma src/ dan public/ -- .env* WAJIB ikut, karena semua
# NEXT_PUBLIC_* di-inline ke bundle klien saat build. Kalau NEXT_PUBLIC_API_URL
# diubah (misal dari localhost ke IP LAN) tapi build-nya dilewati, bundle lama
# tetap dipakai dan kiosk masih nembak API yang lama -- gagalnya diam-diam,
# kelihatannya jalan tapi datanya tidak masuk. next.config.ts juga ikut karena
# isinya bercabang di NODE_ENV.
#
# Pakai isi file, bukan timestamp: `git checkout` / `git pull` sering nulis
# ulang file dengan isi yang sama persis, dan itu tidak perlu rebuild.
function Get-FrontendFingerprint {
    $files = @()

    foreach ($sub in @('src', 'public')) {
        $dir = Join-Path $FrontendDir $sub
        if (Test-Path $dir) {
            $files += Get-ChildItem -Path $dir -Recurse -File -Force -ErrorAction SilentlyContinue
        }
    }

    # node_modules, .next, dan *.tsbuildinfo sengaja tidak ikut: yang pertama
    # sudah terwakili package-lock.json, dua sisanya justru output.
    foreach ($name in @(
        'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json',
        'postcss.config.mjs', 'components.json', 'eslint.config.mjs',
        '.env', '.env.local', '.env.production'
    )) {
        $p = Join-Path $FrontendDir $name
        if (Test-Path $p) { $files += Get-Item -Path $p -Force }
    }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        foreach ($f in ($files | Sort-Object -Property FullName)) {
            # Path ikut di-hash supaya rename/pindah file kedeteksi juga, bukan
            # cuma perubahan isi.
            $rel  = $f.FullName.Substring($FrontendDir.Length).Replace('\', '/')
            $meta = [System.Text.Encoding]::UTF8.GetBytes("$rel`n")
            [void] $sha.TransformBlock($meta, 0, $meta.Length, $null, 0)

            $data = [System.IO.File]::ReadAllBytes($f.FullName)
            if ($data.Length -gt 0) {
                [void] $sha.TransformBlock($data, 0, $data.Length, $null, 0)
            }
        }
        [void] $sha.TransformFinalBlock((New-Object byte[] 0), 0, 0)
        return [System.BitConverter]::ToString($sha.Hash).Replace('-', '')
    } finally {
        $sha.Dispose()
    }
}

# ------------------------------------------------------------------ ports ---

$BackendPort  = [int] (Get-EnvValue (Join-Path $BackendDir  '.env')       'APP_PORT' '8080')
$DobotPort    = [int] (Get-EnvValue (Join-Path $DobotDir    '.env')       'PORT'     '5001')
$FrontendPort = [int] (Get-EnvValue (Join-Path $FrontendDir '.env.local') 'PORT'     '3000')

# =========================================================================
#  MODE PANE - dipanggil balik oleh window utama, satu service per pane
# =========================================================================

if ($Service) {
    $Host.UI.RawUI.WindowTitle = "glambot :: $Service"

    switch ($Service) {

        'backend' {
            Set-Location $BackendDir
            Write-Host "=== BACKEND (Go) :$BackendPort ===" -ForegroundColor Cyan
            Write-Host "compiling..." -ForegroundColor DarkGray

            # Sengaja build+run, bukan `go run .`. `go run` bikin proses anak
            # yang tidak ikut mati waktu pane ditutup; ini satu proses saja jadi
            # Ctrl+C bersih, dan build berikutnya incremental (lebih cepat).
            & go build -o 'bin\photobooth.exe' .
            if ($LASTEXITCODE -ne 0) {
                Write-Host "`n[X] go build gagal. Perbaiki error di atas lalu jalankan ulang." -ForegroundColor Red
                return
            }
            & '.\bin\photobooth.exe'
        }

        'frontend' {
            Set-Location $FrontendDir
            Write-Host "=== FRONTEND (Next.js) :$FrontendPort ===" -ForegroundColor Magenta

            if ($Dev) {
                Write-Host "mode: dev (HMR nyala)" -ForegroundColor DarkGray
                & npm run dev
                return
            }

            # --- build cuma kalau perlu -----------------------------------
            $stampFile = Join-Path $FrontendDir '.next\.glambot-build-stamp'
            $buildId   = Join-Path $FrontendDir '.next\BUILD_ID'

            Write-Host 'mode: production - cek perubahan...' -ForegroundColor DarkGray
            $sw   = [System.Diagnostics.Stopwatch]::StartNew()
            $now  = Get-FrontendFingerprint
            $prev = if (Test-Path $stampFile) { (Get-Content $stampFile -Raw).Trim() } else { '' }
            $sw.Stop()

            $needBuild = $true
            if ($Rebuild) {
                Write-Host '  -Rebuild: build dipaksa' -ForegroundColor DarkGray
            } elseif (-not (Test-Path $buildId)) {
                # BUILD_ID cuma dibuat oleh `next build`. Kalau tidak ada,
                # .next isinya bukan production build -> npm run start bakal
                # nolak jalan.
                Write-Host '  belum ada production build di .next' -ForegroundColor DarkGray
            } elseif (-not $prev) {
                Write-Host '  belum ada stamp build sebelumnya' -ForegroundColor DarkGray
            } elseif ($prev -ne $now) {
                Write-Host '  ada perubahan sejak build terakhir' -ForegroundColor DarkGray
            } else {
                $needBuild = $false
                Write-Host ("  tidak ada perubahan (cek {0} ms) -> BUILD DILEWATI" -f $sw.ElapsedMilliseconds) -ForegroundColor Green
            }

            if ($needBuild) {
                Write-Host '  building... (sabar, ini yang lama)' -ForegroundColor DarkGray
                & npm run build
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "`n[X] next build gagal. Perbaiki error di atas lalu jalankan ulang." -ForegroundColor Red
                    return
                }
                # Stamp ditulis SETELAH build sukses, dan sengaja di dalam
                # .next supaya -Clean ikut membuangnya. Sidik jarinya dihitung
                # ulang: build sendiri bisa menyentuh file di src/ (misal
                # .tsbuildinfo di dalamnya), jadi nilai sebelum-build bisa
                # basi dan bikin build berikutnya jalan percuma.
                Set-Content -Path $stampFile -Value (Get-FrontendFingerprint) -Encoding ASCII
                Write-Host '  build selesai.' -ForegroundColor Green
            }

            Write-Host '  starting server...' -ForegroundColor DarkGray
            & npm run start
        }

        'dobot' {
            Set-Location $DobotDir
            Write-Host "=== DOBOT (Python) :$DobotPort ===" -ForegroundColor Yellow

            # Dobot narik tuning robot dari backend saat boot (app/config +
            # apply_backend_overrides). Dia memang punya retry, tapi kalau kita
            # tunggu backend siap dulu, fetch pertamanya langsung kena -> nilai
            # dari DB yang kepakai, bukan fallback .env.
            [void] (Wait-Port -Port $BackendPort -Label 'backend' -TimeoutSec 60)

            $py = Join-Path $DobotDir 'venv\Scripts\python.exe'
            if ($NoRobot) {
                Write-Host "mode: --no-robot (vision only, robot dry-run)" -ForegroundColor DarkGray
                & $py main.py --no-robot
            } else {
                & $py main.py
            }
        }
    }

    Write-Host "`n--- service '$Service' berhenti (exit $LASTEXITCODE) ---" -ForegroundColor DarkGray
    return
}

# =========================================================================
#  MODE LAUNCHER - preflight, bersih-bersih, lalu spawn 3 pane
# =========================================================================

Write-Host ''
Write-Host '  GLAMBOT PHOTO BOOTH' -ForegroundColor White
Write-Host ("  backend :{0}   frontend :{1}   dobot :{2}" -f $BackendPort, $FrontendPort, $DobotPort) -ForegroundColor DarkGray
Write-Host ''

# --- 1. preflight: gagal cepat dengan pesan jelas, bukan 3 pane yang diam-diam mati

Write-Host '[1/5] cek prasyarat' -ForegroundColor Cyan
$problems = @()

foreach ($tool in @('go', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        $problems += "'$tool' tidak ada di PATH"
    }
}

$required = @{
    'backend\.env'               = 'config backend (copy dari backend\.env.example)'
    'dobot\.env'                 = 'config dobot (copy dari dobot\.env.example)'
    'dobot\venv\Scripts\python.exe' = 'virtualenv dobot (cd dobot; python -m venv venv; venv\Scripts\pip install -r requirements.txt)'
    'frontend\node_modules'      = 'dependency frontend (cd frontend; npm install)'
}
foreach ($rel in $required.Keys) {
    if (-not (Test-Path (Join-Path $Root $rel))) {
        $problems += "$rel tidak ada -> $($required[$rel])"
    }
}

# frontend boleh pakai .env atau .env.local, salah satu cukup
if (-not (Test-Path (Join-Path $FrontendDir '.env.local')) -and
    -not (Test-Path (Join-Path $FrontendDir '.env'))) {
    $problems += 'frontend\.env.local tidak ada -> copy dari frontend\.env.example'
}

if ($problems.Count -gt 0) {
    Write-Host ''
    Write-Host '  [X] belum bisa jalan:' -ForegroundColor Red
    foreach ($p in $problems) { Write-Host "      - $p" -ForegroundColor Red }
    Write-Host ''
    exit 1
}
Write-Host '      semua ada.' -ForegroundColor Green

# --- 2. bunuh sisa proses yang masih pegang port

Write-Host '[2/5] bersihin port nyangkut' -ForegroundColor Cyan
Stop-Port -Port $BackendPort  -Label 'backend'
Stop-Port -Port $FrontendPort -Label 'frontend'
Stop-Port -Port $DobotPort    -Label 'dobot'

# --- 3. cache

Write-Host '[3/5] bersihin cache' -ForegroundColor Cyan

# __pycache__ dobot: murah, aman dihapus tiap start.
$pycache = Get-ChildItem -Path $DobotDir -Filter '__pycache__' -Recurse -Directory -ErrorAction SilentlyContinue |
           Where-Object { $_.FullName -notlike "*\venv\*" }
foreach ($d in $pycache) { Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ("      __pycache__ dihapus ({0} folder)" -f @($pycache).Count) -ForegroundColor DarkGray

# Profil browser: dibuang tiap start, jadi kiosk selalu ketemu asset terbaru
# tanpa harus rebuild .next yang mahal itu.
if (Test-Path $ProfileDir) {
    Remove-Item $ProfileDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '      profil browser di-reset' -ForegroundColor DarkGray
}

# .next hanya kalau diminta. Dipertahankan = `next build` bisa incremental
# (jauh lebih cepat); dihapus = build dari nol.
$nextDir = Join-Path $FrontendDir '.next'
if ($Clean) {
    if (Test-Path $nextDir) {
        Remove-Item $nextDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host '      frontend\.next dihapus (build dari nol, sabar ya)' -ForegroundColor DarkGray
    }
} else {
    Write-Host '      frontend\.next dipertahankan (build incremental; -Clean buat dari nol)' -ForegroundColor DarkGray
}

# --- 4. spawn pane

Write-Host '[4/5] nyalain service' -ForegroundColor Cyan

$self  = $PSCommandPath
$flags = ''
if ($Clean)   { $flags += ' -Clean' }
if ($NoRobot) { $flags += ' -NoRobot' }
if ($Dev)     { $flags += ' -Dev' }
if ($Rebuild) { $flags += ' -Rebuild' }

function Get-PaneCommand {
    param([string] $Name)
    return "powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File `"$self`" -Service $Name$flags"
}

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) {
    # backend kiri | frontend kanan-atas / dobot kanan-bawah.
    # split-pane selalu memecah pane yang lagi fokus, dan fokus pindah ke pane
    # baru setelah split -- makanya -H yang kedua memecah frontend, bukan backend.
    $wtArgs = @(
        "-w new new-tab --title backend -d `"$BackendDir`" $(Get-PaneCommand 'backend')",
        "split-pane -V --title frontend -d `"$FrontendDir`" $(Get-PaneCommand 'frontend')",
        "split-pane -H --title dobot -d `"$DobotDir`" $(Get-PaneCommand 'dobot')"
    ) -join ' ; '

    Start-Process -FilePath $wt.Source -ArgumentList $wtArgs
    Write-Host '      Windows Terminal: 3 pane (backend | frontend / dobot)' -ForegroundColor DarkGray
} else {
    # Fallback kalau Windows Terminal tidak terpasang: 3 window biasa.
    Write-Host '      wt.exe tidak ada -> pakai 3 window terpisah' -ForegroundColor DarkYellow
    foreach ($s in @('backend', 'frontend', 'dobot')) {
        Start-Process -FilePath 'powershell' `
            -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$self`" -Service $s$flags"
    }
}

# --- 5. tunggu frontend benar-benar melayani, lalu buka kiosk

if ($NoBrowser) {
    Write-Host '[5/5] -NoBrowser: browser tidak dibuka' -ForegroundColor Cyan
    Write-Host ("`n      buka manual: http://localhost:{0}`n" -f $FrontendPort) -ForegroundColor White
    exit 0
}

# Batas atas, bukan lama tunggu -- loop di bawah berhenti begitu frontend
# menjawab. Kalau tidak ada perubahan, build dilewati dan ini cuma hitungan
# detik; kalau ada, `npm run build` harus kelar dulu baru servernya nyala.
$waitSec = if ($Dev) { 240 } elseif ($Clean) { 900 } else { 600 }
Write-Host ("[5/5] tunggu frontend siap (batas {0} menit)" -f [math]::Round($waitSec / 60)) -ForegroundColor Cyan
if (-not $Dev) {
    Write-Host '      kalau ada perubahan, next build jalan dulu - wajar kalau lama' -ForegroundColor DarkGray
}

$url   = "http://localhost:$FrontendPort"
$ready = $false
# Yang dicek harus response HTTP-nya, bukan cuma port kebuka. Di dev, Next baru
# compile halaman waktu request pertama masuk (request ini sekalian pemanasan);
# di production, port baru kebuka setelah build selesai.
$deadline = (Get-Date).AddSeconds($waitSec)
Write-Host '      ' -NoNewline
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { $ready = $true; break }
    } catch {
        # belum nyala / masih compile
    }
    Write-Host '.' -NoNewline
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Host ''
    Write-Host ("      [!] frontend belum merespons dalam {0} detik. Cek pane 'frontend'." -f $waitSec) -ForegroundColor Yellow
    exit 1
}
Write-Host ' siap.' -ForegroundColor Green

$chrome = Find-Chrome
if (-not $chrome) {
    Write-Host "      [!] Chrome/Edge tidak ketemu. Buka manual: $url" -ForegroundColor Yellow
    exit 0
}

$chromeArgs = @(
    '--kiosk'
    "--user-data-dir=`"$ProfileDir`""
    '--no-first-run'
    '--no-default-browser-check'
    '--disable-session-crashed-bubble'
    '--disable-infobars'
    # Kiosk memutar cue audio otomatis (storage/audio/*.mp3); tanpa flag ini
    # Chrome memblokir play() sampai ada interaksi user.
    '--autoplay-policy=no-user-gesture-required'
    $url
)

Start-Process -FilePath $chrome -ArgumentList $chromeArgs
Write-Host ''
Write-Host ("      kiosk terbuka -> {0}  (profil bersih, keluar dengan Alt+F4)" -f $url) -ForegroundColor Green
Write-Host ''
