# Glambot Photo Booth

Aplikasi photo booth kiosk dengan integrasi robot kamera + auto-capture berbasis gesture/preset. Kamera memakai **Canon DSLR** via [digiCamControl](https://digicamcontrol.com/). Dilengkapi **dashboard admin** untuk kelola frame, paket, voucher, transaksi, dan perangkat — semua data bisa diedit dari UI tanpa sentuh database.

---

## Daftar Isi

1. [Update Terbaru](#update-terbaru)
2. [Arsitektur](#arsitektur)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Instalasi](#instalasi)
6. [Konfigurasi Environment](#konfigurasi-environment)
7. [Setup Database](#setup-database)
8. [Menjalankan Aplikasi](#menjalankan-aplikasi)
9. [Admin Dashboard](#admin-dashboard)
10. [Production Build](#production-build)
11. [Struktur Project](#struktur-project)
12. [Skema Database](#skema-database)
13. [API Endpoints](#api-endpoints)
14. [User Flow](#user-flow)
15. [Integrasi Robot](#integrasi-robot)
16. [Mode Kamera](#mode-kamera)
17. [Audio Cues](#audio-cues)
18. [Animated GIF Output](#animated-gif-output)
19. [Safeguard Sesi Foto](#safeguard-sesi-foto)
20. [Testing dengan curl](#testing-dengan-curl)
21. [Troubleshooting](#troubleshooting)

---

## Update Terbaru

Ringkasan perubahan terbaru (per Juni 2026):

### Data default kini permanen & editable (penting)
- Seed `packages`, `frames`, `vouchers` di [`init.sql`](backend/migrations/init.sql) diubah dari `ON CONFLICT … DO UPDATE` → **`DO NOTHING`** (insert-only).
- **Sebelumnya** setiap server restart menimpa kembali data default (frame-164…167, paket regular/vip, voucher) ke nilai seed — sehingga edit admin (mis. ganti nama frame) **balik lagi** setiap boot.
- **Sekarang** seed hanya mengisi data awal pada install baru; **dashboard admin jadi sumber kebenaran**. Semua data default bisa diedit dan tidak ter-reset saat build/restart ulang.

### Photo editor (VIP) — canvas
- Fix crash `Cannot read properties of null (reading 'clearRect')` saat ganti frame dengan dimensi berbeda — canvas Fabric kini di-handle via instance hidup (ref), bukan closure basi.
- Canvas dirender di **ruang koordinat asli frame** (`canvas_width`/`canvas_height`), bukan lagi hardcode 464×696 — posisi slot selalu pas walau frame beda dimensi.
- Dukungan shape slot `circle` (selain `rect`/`ellipse`), dengan fallback aman ke `rect` untuk shape tak dikenal.

### Admin — frame & paket
- Form frame: tombol **Next** tidak lagi macet di Step 1, rasio canvas dikunci **2:3** (mis. 464×696), dan slot di-normalisasi id-nya di backend (`ensureSlotIDs`) supaya tiap slot punya id unik & stabil.
- Paket: tambah field **`print_unit_price`** (harga cetak ekstra per-paket) — menggantikan hardcode `vip = 15000` di kode lama. Disimpan juga sebagai snapshot di tabel `sessions`.

### Halaman Photo Session
- Bar "Photo Session" + area preview kini **full-screen** (`fixed inset-0`), lepas dari batas `max-w` layout publik, agar pas di layar kiosk lebar.

---

## Arsitektur

```
┌─────────────────────────────┐         ┌────────────────────────────┐
│  Frontend (Next.js 16)      │         │  Backend (Go + Chi)        │
│  Port 3000                  │ ◀────▶  │  Port 8080                 │
│  - Kiosk UI                 │   HTTP  │  - REST API                │
│  - Photo editor             │   CORS  │  - Storage files           │
│  - QR code generation       │         │  - Robot proxy             │
└────────────┬────────────────┘         └─────┬──────────────────────┘
             │                                │
             │ User scan QR di HP             │ ┌──────────────────┐
             ↓                                ├▶│  PostgreSQL      │
   ┌─────────────────────────┐                │ │  sessions,       │
   │  /download-photos/[id]  │                │ │  photos, frames, │
   │  (HP browser)           │                │ │  vouchers, txns  │
   └─────────────────────────┘                │ └──────────────────┘
                                              │
                                              │ ┌──────────────────┐
                                              ├▶│  digiCamControl  │
                                              │ │  Port 5513       │
                                              │ │  (Canon DSLR)    │
                                              │ └──────────────────┘
                                              │
                                              │ ┌──────────────────┐
                                              └▶│  Robot (eksternal)│
                                                │  via ngrok/LAN   │
                                                │  POST /preset    │
                                                └──────────────────┘
                                                       │
                                                       ↓ callback
                                          POST /api/robot/move
                                          POST /api/robot/done
                                          POST /api/robot/webhook
```

---

## Tech Stack

### Backend
- **Go 1.21+** — main runtime
- **[Chi v5](https://github.com/go-chi/chi)** — HTTP router
- **[lib/pq](https://github.com/lib/pq)** — PostgreSQL driver
- **[uuid](https://github.com/google/uuid)** — ID generation
- **[Midtrans Go SDK](https://github.com/Midtrans/midtrans-go)** — payment gateway
- **JWT (HMAC-SHA256) + bcrypt** — auth dashboard admin (login + token)
- **[Google Drive API](https://developers.google.com/drive)** — upload hasil sesi ke Drive (opsional)

### Frontend
- **Next.js 16** (Turbopack, App Router)
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 4**
- **TanStack Query 5** — server state
- **Axios** — HTTP client
- **Fabric.js 5** — canvas for photo editor
- **qrcode.react** — QR code generation
- **lottie-react** — loading animations
- **lucide-react** — icons
- **Radix UI** — primitives (dialog, slot)

### Eksternal (opsional)
- **digiCamControl** — control Canon DSLR (Windows only)
- **PostgreSQL 14+**
- **Midtrans Sandbox** — untuk QRIS payment testing

---

## Prerequisites

Pastikan sudah ter-install:

| Tool | Versi minimum | Catatan |
|---|---|---|
| Go | 1.21+ | [Download](https://go.dev/dl/) |
| Node.js | 20.x+ | LTS recommended |
| npm | 10.x+ | Bundled dengan Node |
| PostgreSQL | 14+ | Native install atau Docker |
| Git | latest | |
| digiCamControl | 2.1+ | **Opsional**, untuk mode Canon |

---

## Instalasi

### 1. Clone repository

```bash
git clone <repo-url>
cd glambot-app
```

### 2. Setup PostgreSQL

**Cukup buat database kosong** — backend akan **auto-run migration** saat startup pertama. Tidak perlu manual `psql -f`.

```bash
psql -U postgres -c "CREATE DATABASE photobooth;"
```

Backend saat `go run .` akan baca [`backend/migrations/init.sql`](backend/migrations/init.sql) dan apply semua schema + seed otomatis. Idempotent, jadi restart kedua kali tidak akan duplicate atau break.

Kalau mau jalankan manual (debugging, fresh seed, dll):
```bash
psql -U postgres -d photobooth -f backend/migrations/init.sql
```

Migration ini berisi:

- **7 tables** + indexes: `packages`, `frames`, `sessions`, `transactions`, `vouchers`, `voucher_usage`, `photos`
- **2 packages** default: `regular` (Digital, Rp 45k) + `vip` (Print, Rp 65k, popular)
- **4 frames** default dengan slot coordinates lengkap: `frame-164` (6 rect), `frame-165` (6 rect), `frame-166` (4 rect), `frame-167` (6 ellipse)
- **4 vouchers** default:
  - `GLAMBOT10` — 10% off, min Rp 50k
  - `FREESHIP` — Rp 15k flat off
  - `GLAMSHINE` — 50% off, no minimum
  - `GLAMHERO` — 100% off (gratis), no minimum
- **1 admin** default di-seed otomatis oleh backend saat startup (kalau tabel `admins` kosong) — kredensial dari env `ADMIN_EMAIL` / `ADMIN_PASSWORD` (lihat [Admin Dashboard](#admin-dashboard))

Idempotent via `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING` (**insert-only**) — aman dijalankan berulang. Seed hanya mengisi data awal pada install baru; **re-run TIDAK menimpa data yang sudah ada**, jadi edit via dashboard admin (nama frame, harga paket, slot, voucher) tetap aman walau server di-restart.

### 3. Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env sesuai kebutuhan (lihat section Konfigurasi Environment)
go mod download
```

### 4. Setup Frontend

```bash
cd ../frontend
cp .env.example .env.local
# Edit .env.local sesuai kebutuhan
npm install
```

---

## Konfigurasi Environment

### Backend (`backend/.env`)

```ini
# Server
APP_PORT=8080
APP_ENV=development

# PostgreSQL
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/photobooth?sslmode=disable

# Midtrans (opsional, untuk QRIS payment)
MIDTRANS_SERVER_KEY=Mid-server-xxxxxxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=Mid-client-xxxxxxxxxxxxxxxx
MIDTRANS_ENV=sandbox

# Storage
STORAGE_PATH=./storage

# digiCamControl HTTP API (untuk Canon)
DIGICAM_BASE_URL=http://localhost:5513/api

# Session
SESSION_EXPIRY_HOURS=72
CLEANUP_INTERVAL_HOURS=24

# CORS allowed origin
FRONTEND_URL=http://localhost:3000

# Camera: Canon-only via digiCamControl (lihat DIGICAM_BASE_URL).

# Robot integration (opsional)
ROBOT_API_URL=https://your-robot-ngrok.ngrok-free.dev
ROBOT_ENABLED=false

# Admin dashboard auth
# JWT_SECRET dipakai menandatangani token login admin (HMAC-SHA256) — WAJIB
# diganti di production. ADMIN_EMAIL/ADMIN_PASSWORD = kredensial admin default
# yang di-seed sekali saat tabel admins masih kosong.
JWT_SECRET=ganti-dengan-secret-acak-panjang
ADMIN_EMAIL=admin@glambot.com
ADMIN_PASSWORD=admin123

# Google Drive upload (opsional) — upload hasil tiap sesi ke Drive, lalu QR di
# halaman download mengarah ke folder publiknya. Kosongkan untuk menonaktifkan.
# Cara dapat refresh token: isi CLIENT_ID/SECRET, lalu `go run ./cmd/gdrive-token`.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

### Frontend (`frontend/.env.local`)

```ini
# Backend API URL
# - Kosongkan untuk auto-detect dari hostname (recommended kalau akses dari HP via LAN)
# - Set ke http://localhost:8080 untuk dev di mesin sendiri
# - Set ke http://192.168.x.x:8080 untuk cross-device testing
NEXT_PUBLIC_API_URL=http://localhost:8080

# QR code download URL override (opsional)
# Set kalau kiosk diakses via localhost tapi QR harus encode LAN IP
# NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL=http://192.168.1.150:3000
```

---

## Setup Database

### Verifikasi seed berhasil

```bash
psql -U postgres -d photobooth -c "SELECT id, code, name, base_price FROM packages ORDER BY id;"
psql -U postgres -d photobooth -c "SELECT id, name, photo_slots FROM frames ORDER BY sort_order;"
psql -U postgres -d photobooth -c "SELECT code, discount_type, discount_value, min_price FROM vouchers ORDER BY discount_value DESC;"
```

Hasil yang diharapkan:
- **2 packages** (`regular` = Digital, `vip` = Print)
- **4 frames** (`frame-164`, `frame-165`, `frame-166`, `frame-167`)
- **4 vouchers** (`GLAMHERO` 100%, `GLAMSHINE` 50%, `GLAMBOT10` 10%, `FREESHIP` Rp 15k)

### Re-run migration

Migration `init.sql` idempotent — aman di-jalankan kapan saja (baik via backend startup atau manual):

```bash
psql -U postgres -d photobooth -f backend/migrations/init.sql
```

Akan:
- Skip table yang sudah ada (NOTICE: "already exists")
- **Tidak menimpa** data packages/frames/vouchers yang sudah ada (`ON CONFLICT DO NOTHING`) — edit admin aman, hanya baris baru pada install fresh yang di-insert
- Jalankan compatibility migrations (tambah kolom baru via `ADD COLUMN IF NOT EXISTS`, backfill nilai kosong/null saja)

> ⚠️ **Reset paksa ke data default:** karena seed sekarang insert-only, untuk mengembalikan satu baris ke nilai seed kamu harus hapus dulu barisnya (mis. `DELETE FROM frames WHERE id = 'frame-164';`) lalu re-run migration. Atau cukup edit lewat dashboard admin.

### Tambah frame baru manual

Frame metadata disimpan di tabel `frames` dengan slot coordinates di kolom `slots` (JSONB). File PNG/SVG-nya di-store di `backend/storage/frames/`.

```sql
INSERT INTO frames (id, name, file_path, thumb_url, photo_slots, canvas_width, canvas_height, slots, sort_order)
VALUES (
  'frame-custom',
  'Frame Custom',
  'frames/frame-custom.svg',
  '/storage/frames/frame-custom.svg',
  3,
  464,
  696,
  '[
    {"id":"slot-1","shape":"rect","x":20,"y":40, "width":420,"height":190,"label":"Top"},
    {"id":"slot-2","shape":"rect","x":20,"y":250,"width":420,"height":190,"label":"Middle"},
    {"id":"slot-3","shape":"rect","x":20,"y":460,"width":420,"height":190,"label":"Bottom"}
  ]'::jsonb,
  5
);
```

Lalu copy file `frame-custom.svg` ke `backend/storage/frames/`.

---

## Menjalankan Aplikasi

### Dev mode (2 terminal)

**Terminal 1 — Backend:**
```bash
cd backend
go run .
```

Backend listen di `http://localhost:8080` (atau `:8080` di semua interface untuk LAN access).

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Frontend di `http://localhost:3000`. Open dari browser kiosk.

### Akses dari HP (LAN)

Di PC dev (Windows):
1. Cari IP LAN: `ipconfig` → catat "IPv4 Address" (misal `192.168.1.150`)
2. Allow Windows Firewall untuk port 3000 + 8080
3. Edit `frontend/.env.local`:
   ```ini
   NEXT_PUBLIC_API_URL=
   ```
   (Kosong = auto-detect berdasarkan hostname browser. HP akses via `192.168.1.150:3000` → frontend otomatis fetch dari `192.168.1.150:8080`.)
4. Restart `npm run dev`

Di HP (browser):
- Buka `http://192.168.1.150:3000` untuk kiosk view
- Atau scan QR code dari kiosk untuk langsung ke `/download-photos/[sessionId]`

---

## Admin Dashboard

Dashboard internal untuk kelola konten kiosk tanpa sentuh database langsung.

### Login

- URL: `http://localhost:3000/login`
- Kredensial default (dari env, di-seed saat tabel `admins` kosong):
  - Email: `ADMIN_EMAIL` (default `admin@glambot.com`)
  - Password: `ADMIN_PASSWORD` (default `admin123`)
- Auth pakai JWT (HMAC-SHA256, secret `JWT_SECRET`). **Ganti `JWT_SECRET` & password default di production.**

> Admin default hanya dibuat sekali saat tabel `admins` masih kosong. Mau ganti password? Ubah lewat dashboard, atau hapus baris di tabel `admins` lalu set `ADMIN_PASSWORD` baru dan restart backend.

### Halaman

| Route | Fungsi |
|---|---|
| `/dashboard` | Ringkasan (summary metrics) |
| `/frame` | CRUD frame (upload PNG/SVG, atur canvas 2:3, slot editor, aktif/nonaktif) |
| `/packages` | CRUD paket (harga, durasi, print_count, `print_unit_price`, popular) |
| `/voucher` | CRUD voucher (percent/fixed, min price, max uses, expiry) |
| `/transaction` | Riwayat transaksi pembayaran |
| `/devices` | Status koneksi kamera / printer / robot (tes nyata) |
| `/settings` | Pengaturan |

Semua perubahan **tersimpan permanen** dan **tidak ter-reset** saat server restart (lihat [Update Terbaru](#update-terbaru)).

### API admin (ringkas)

Semua di-prefix `/api/admin` dan butuh token JWT (header `Authorization: Bearer <token>`):

| Method | Path | Tujuan |
|---|---|---|
| POST | `/api/admin/login` | Login → return token + info admin |
| GET/POST/PATCH/DELETE | `/api/admin/frames[/{id}]` | CRUD frame (+ `/stats`) |
| GET/POST/PATCH/DELETE | `/api/admin/packages[/{id}]` | CRUD paket |
| GET/POST/PATCH/DELETE | `/api/admin/vouchers[/{id}]` | CRUD voucher |
| GET | `/api/admin/transactions` | List transaksi |
| GET | `/api/admin/devices` | Tes koneksi perangkat |
| GET | `/api/admin/dashboard/summary` | Metrics ringkasan |

---

## Production Build

### Backend

```bash
cd backend
go build -o photobooth.exe .  # Windows
go build -o photobooth .       # Linux/Mac
./photobooth                   # run
```

### Frontend

```bash
cd frontend
npm run build
npm run start
```

Production server di `http://localhost:3000`. **Tidak ada HMR**, lebih cepat, tidak ada `allowedDevOrigins` restriction.

---

## Struktur Project

```
glambot-app/
├── backend/
│   ├── config/
│   │   └── config.go              # Load env + runtime state (current_preset, auto_capture_at)
│   ├── database/
│   │   └── database.go            # PostgreSQL connection pool
│   ├── handlers/
│   │   ├── helpers.go             # respondJSON, respondError, firstNonEmpty
│   │   ├── payment.go             # CreatePayment, GetPaymentStatus, PaymentWebhook (Midtrans)
│   │   ├── photo.go               # UploadPhoto, ComposeFrame, GetSessionPhotos, GetFramedPhotos, GetFrames, DownloadPhoto
│   │   ├── robot.go               # GetCameraStatus, RobotCapture, GetLiveView, EnableRobot, DisableRobot, TriggerPreset, RobotMoving, RobotDone, RobotWebhook, GetRobotConfig
│   │   ├── session.go             # GetPackages, CreateSession, GetSession, UpdateSessionStatus
│   │   ├── voucher.go             # ApplyVoucher, RemoveVoucher
│   │   ├── admin_auth.go          # EnsureDefaultAdmin (seed), AdminLogin (JWT)
│   │   ├── admin_frames.go        # CRUD frame + ensureSlotIDs (normalisasi slot id)
│   │   ├── admin_packages.go      # CRUD paket (+ print_unit_price)
│   │   ├── admin_vouchers.go      # CRUD voucher
│   │   ├── admin_dashboard.go     # Summary metrics
│   │   └── admin_devices.go       # Tes koneksi kamera/printer/robot
│   ├── middleware/
│   │   └── cors.go                # CORS allow list (localhost + LAN private ranges)
│   ├── migrations/
│   │   └── init.sql               # Canonical schema + seed (auto-run on startup)
│   ├── models/
│   │   └── models.go              # Session, Photo, Frame, Voucher, Transaction, PackageInfo types
│   ├── routes/
│   │   └── routes.go              # All HTTP route definitions
│   ├── services/
│   │   ├── camera.go              # Canon liveview + capture via digiCamControl
│   │   ├── burst.go               # Burst-capture liveview frames during 3s countdown (untuk Live Strip GIF)
│   │   ├── gif.go                 # Slideshow GIF generator (raw photos terpilih, loop)
│   │   ├── gif_live.go            # Live Strip GIF generator (framed + burst overlay + frame design top-layer)
│   │   ├── cleanup.go             # Periodic cleanup of expired sessions
│   │   ├── midtrans.go            # Midtrans QRIS integration
│   │   └── robot.go               # HTTP client to external robot API
│   ├── storage/
│   │   ├── audio/                 # tiga, dua, satu, inisiasi, preset, presetTerkonfirmasi, etc.
│   │   ├── frames/                # Frame SVG assets (embedded base64 PNG → frame overlay)
│   │   ├── packages/              # Package thumbnails (digital.svg, print.svg)
│   │   └── sessions/{id}/         # Per-session output:
│   │       ├── raw/               #   - canon_*.jpg (foto hasil capture)
│   │       ├── framed/            #   - result_*.jpg (komposisi frame + foto, dari Fabric canvas)
│   │       ├── burst/             #   - {photoID}/frame_*.jpg (liveview frames selama countdown)
│   │       ├── animation.gif      #   - slideshow GIF (lazy-generated saat request pertama)
│   │       └── animation-live-v2.gif #- live-strip GIF (versioned: bump suffix saat compositing logic berubah)
│   ├── .env.example
│   ├── go.mod
│   └── main.go                    # Entry point
│
├── frontend/
│   ├── public/                    # Static assets (Container.svg, bg.webp, finger/, etc.)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (admin)/           # Admin dashboard (login + protected routes)
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── (dashboard)/   # dashboard, frame, packages, voucher,
│   │   │   │                      # transaction, devices, settings, filter
│   │   │   ├── (public)/          # Public routes (kiosk + download)
│   │   │   │   ├── package/page.tsx
│   │   │   │   ├── payment/summary/page.tsx
│   │   │   │   ├── payment/pay/page.tsx
│   │   │   │   ├── instruction/page.tsx
│   │   │   │   ├── photo-session/page.tsx
│   │   │   │   ├── photo-session/control/page.tsx
│   │   │   │   ├── photo-editor/page.tsx
│   │   │   │   ├── session-end/page.tsx
│   │   │   │   └── download-photos/[sessionId]/page.tsx
│   │   │   ├── layout.tsx         # Root layout (background, fonts, Providers)
│   │   │   ├── providers.tsx      # React Query provider
│   │   │   ├── page.tsx           # Home / landing
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── not-found.tsx
│   │   ├── assets/                # Local fixed assets (loading.json Lottie)
│   │   ├── components/
│   │   │   ├── shared/            # GlassCard, Timer, StatusAnimation, Spinner
│   │   │   └── ui/                # Button, Dialog, Input (Radix wrappers)
│   │   ├── features/
│   │   │   └── public/
│   │   │       ├── home/
│   │   │       ├── instruction/   # Multi-step instruction (3 cards + 60s timer)
│   │   │       ├── package/       # Package selection
│   │   │       ├── payment/       # QRIS + voucher
│   │   │       ├── photo-session/ # Live preview + capture (Canon) + countdown overlay + grace-period safeguard
│   │   │       │                  # api/getRobotConfig.ts: shared useRobotConfig() hook (React Query, 250ms poll dedupe)
│   │   │       ├── photo-editor/  # Select & Edit (Fabric canvas) — VIP only
│   │   │       ├── photo-download/# Download grid (HP) — slideshow GIF + live-strip GIF preview/download cards
│   │   │       └── session-end/   # QR display + done screen
│   │   ├── lib/
│   │   │   ├── api-client.ts      # axios instance + resolveBaseUrl + toAbsoluteUrl
│   │   │   ├── audio.ts           # playBackendAudio helper
│   │   │   ├── formats.ts         # formatRupiah, formatPriceToK
│   │   │   ├── formatTime.ts      # formatTimeMMSS — shared MM:SS + negative grace timer format
│   │   │   ├── usePersistedCountdown.ts # Countdown yang persist via sessionStorage (survive refresh)
│   │   │   ├── react-query.ts     # Query config
│   │   │   └── utils.ts           # cn (Tailwind merge)
│   │   ├── shared/
│   │   │   └── api/session.ts     # createSession, getSession, patchSessionStatus
│   │   └── styles/
│   │       └── globals.css        # Tailwind base + keyframes (countdownPop, slideUp, etc.)
│   ├── .env.example
│   ├── next.config.ts             # allowedDevOrigins, remotePatterns
│   ├── package.json
│   └── tsconfig.json
│
└── README.md                       # This file
```

---

## Skema Database

### `packages`
Master katalog paket photo booth.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | BIGSERIAL PK | |
| code | TEXT UNIQUE | `regular` (Digital) atau `vip` (Print) |
| name | TEXT | Display name |
| description | TEXT | |
| base_price | INT | Harga dasar (Rp) |
| duration_secs | INT | Durasi sesi foto |
| print_count | SMALLINT | Jumlah cetak default |
| print_unit_price | INT | Harga cetak ekstra per lembar (di luar `print_count`) |
| image_src | TEXT | URL gambar paket |
| is_popular | INT (0/1) | Badge "Popular" |
| is_active | INT (0/1) | Toggle aktif |
| status | TEXT | `active` / `inactive` / `draft` (dipakai UI admin) |
| sort_order | INT | Urutan tampil |

### `sessions`
Sesi photo booth per user.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | UUID |
| package_id | BIGINT FK packages | |
| package_code | TEXT | Denormalized cache |
| duration_secs | INT | Copied from package |
| print_count | INT | |
| print_unit_price | INT | Snapshot harga cetak ekstra saat sesi dibuat |
| price, discount, final_price | INT | |
| status | TEXT | `pending_payment` → `paid` → `shooting` → `completed` |
| frame_id | TEXT | Frame yang dipilih (NULL kalau Digital) |
| created_at, expires_at, completed_at | TIMESTAMPTZ | |

### `transactions`
Pembayaran Midtrans.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK sessions | CASCADE delete |
| midtrans_order_id | TEXT UNIQUE | |
| amount | INT | |
| status | TEXT | `pending`/`paid`/`failed`/`expired`/`cancelled` |
| qris_url | TEXT | QRIS image URL |
| qris_raw_string | TEXT | |
| paid_at, created_at | TIMESTAMPTZ | |

### `frames`
Master frame strips dengan slot coordinates.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | e.g. `frame-164` |
| name | TEXT | Display name |
| file_path | TEXT | Relative path `frames/frame-164.svg` |
| thumb_url | TEXT | `/storage/frames/frame-164.svg` |
| photo_slots | INT | Jumlah slot |
| canvas_width, canvas_height | INT | Default 464×696 |
| slots | JSONB | `[{id, shape: 'rect'/'ellipse'/'circle', x, y, width, height, label}, ...]` — id selalu dinormalisasi unik oleh backend (`ensureSlotIDs`) |
| is_active, sort_order | | |

### `photos`
Foto raw (hasil capture) dan framed (hasil compose).

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK sessions | CASCADE delete |
| file_path | TEXT | `sessions/{id}/raw/photo.jpg` atau `sessions/{id}/framed/result.jpg` |
| file_name | TEXT | |
| type | TEXT | `raw` atau `framed` |
| selected | INT (0/1) | User pilih untuk dimasukkan ke strip |
| position | INT | Urutan di strip (1, 2, 3) |
| created_at | TIMESTAMPTZ | |

### `vouchers` + `voucher_usage`
Diskon code.

| Kolom (vouchers) | Tipe | Catatan |
|---|---|---|
| code | TEXT PK | Uppercase |
| description | TEXT | |
| discount_type | TEXT | `percent` atau `fixed` |
| discount_value | INT | % atau Rupiah |
| min_price | INT | Minimum order |
| max_uses, used_count | INT | |
| is_active | INT (0/1) | |
| expires_at | TIMESTAMPTZ | |

---

## API Endpoints

| Method | Path | Tujuan |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/storage/*` | Static file server (frames, photos, audio) |
| GET | `/api/package` | List paket aktif |
| POST | `/api/session/create` (alias `/api/session`) | Buat sesi baru |
| GET | `/api/session/{id}` | Detail sesi |
| PATCH | `/api/session/{id}/status` | Update status sesi |
| POST | `/api/payment/create` (alias `/api/payment/`) | Buat QRIS payment |
| GET | `/api/payment/status/{orderID}` (alias `/api/payment/{orderID}/status`) | Cek status |
| POST | `/api/payment/webhook` | Midtrans notification |
| POST | `/api/voucher/apply` | Apply voucher ke session |
| POST | `/api/voucher/remove` | Cabut voucher |
| GET | `/api/frames` | List frames dari DB (dengan slots) |
| POST | `/api/photo/upload` | Upload single photo (multipart) |
| POST | `/api/photo/compose` | Save composition (multipart: frame + filter + image blob) |
| GET | `/api/photo/session/{id}` | List raw photos |
| GET | `/api/photo/session/{id}/framed` | List framed photos |
| GET | `/api/photo/download/{photoID}` | Download single photo |
| GET | `/api/photo/session/{id}/gif` | Slideshow GIF — loop foto raw terpilih. Pakai `?inline=1` untuk preview di `<img>` (Content-Disposition: inline). |
| GET | `/api/photo/session/{id}/gif-live` | Live strip GIF — framed strip dengan tiap slot animated dari burst frames. Pakai `?inline=1` untuk inline preview. |
| GET | `/api/photo/session/{id}/gif-live/available` | Cek ringan apakah Live Strip GIF tersedia (perlu framed + burst frames). |
| GET | `/api/robot/status` | Cek kamera connected + type |
| POST | `/api/robot/capture` | Manual trigger capture (Canon) |
| GET | `/api/robot/liveview` | Single live frame JPEG (Canon, mirrored) |
| GET | `/api/robot/liveview/stream` | MJPEG continuous stream (Canon) |
| GET | `/api/robot/session/{id}` | Session photos (alias) |
| POST | `/api/robot/enable` | Backend → call robot URL `/robot/enable` |
| POST | `/api/robot/disable` | Backend → call robot URL `/robot/disable` |
| POST | `/api/robot/stop` | Emergency stop |
| POST | `/api/robot/preset` | Backend → call robot URL `/robot/preset` + schedule capture |
| POST | `/api/robot/moving` (alias `/api/robot/move`) | Robot → backend, mulai gerak preset (update `current_preset`) |
| POST | `/api/robot/done` | Robot → backend, selesai gerak (schedule auto-capture 3s) |
| POST | `/api/robot/webhook` | Generic event from robot |
| GET | `/api/robot/config` | Current robot/auto-capture state (di-polling frontend tiap 250ms) |

---

## User Flow

### Flow kiosk

```
[ / Home ]
    │
    ↓ Pilih paket
[ /package ]
    │
    ↓ Lanjut bayar
[ /payment/summary ]   ← Voucher input (auto uppercase)
    │
    ↓ Konfirmasi
[ /payment/pay ]       ← QRIS scan (120s timer)
    │
    ↓ Status = paid (via Midtrans webhook)
[ /instruction ]       ← 3 steps + 60s timer
    │                    Step 3: 🔊 preset.mp3
    ↓ "Got it, Let's Go!" → POST /api/robot/enable
[ /photo-session ]     ← 🔊 inisiasi.mp3, live preview (mirrored)
    │                    10 menit session timer
    │                    Robot trigger: 🔊 presetTerkonfirmasi.mp3
    │                    Auto-capture: countdown 3-2-1 (🔊 tiga/dua/satu.mp3)
    │                    + modal hasil 3 detik
    │                    POST /api/robot/disable saat timer 0
    │
    ↓ VIP                              ↓ Digital
[ /photo-editor ]                [ /session-end ]
  Select & Edit                    ← 30s timer
  (2 menit timer)                    QR code dynamic
  Drag photo ke slot                 (per-session URL)
  Pilih frame + filter
  Confirm Print → save               ↓ 30s
    ↓                            [ DoneScreen ]
[ /session-end ]                   "Thank You!"
                                     ↓ 30s
                                 [ / Home ]
```

### Flow HP (download)

User scan QR code di `/session-end` → buka `http://<kiosk-ip>:3000/download-photos/{sessionId}` di HP.

```
[ /download-photos/{sessionId} ]
  Header: "Download Your Photos"
  Section "Hasil Strip"       — framed composition (object-contain 2:3)
  Section "Animated GIF"      — 2 card:
                                  • Slideshow Foto (loop foto raw)
                                  • Live Strip (framed + burst, hanya tampil
                                    kalau /gif-live/available returns true)
  Section "Foto Mentah"        — semua raw photos (grid 2×N atau 3×N)
  Tombol "Download Semua (N)"  — sticky di bottom
```

Tap ikon download di tiap card → fetch blob → trigger browser download via `<a download>`.

---

## Integrasi Robot

Robot eksternal di-trigger oleh backend (forward dari frontend) dan callback balik via webhooks.

### Backend → Robot

`services/robot.go` mengirim request ke `${ROBOT_API_URL}/robot/<action>`:

| Frontend call | Backend forward | Robot terima |
|---|---|---|
| `POST /api/robot/enable` | `POST {ROBOT_API_URL}/robot/enable` | (kosong) |
| `POST /api/robot/disable` | `POST {ROBOT_API_URL}/robot/disable` | (kosong) |
| `POST /api/robot/stop` | `POST {ROBOT_API_URL}/robot/stop` | (kosong) |
| `POST /api/robot/preset` | `POST {ROBOT_API_URL}/robot/preset` | `{"preset": N}` |

### Robot → Backend (callbacks)

Robot harus call ini saat siklus gerak:

| Robot panggil | Body | Effect di backend |
|---|---|---|
| `POST /api/robot/moving` (alias `/move`) | `{"preset": N, "session_id": "..."}` | Update `current_preset`, reset `auto_capture_at`. Frontend deteksi → play `presetTerkonfirmasi.mp3` |
| `POST /api/robot/done` | `{"preset": N, "session_id": "..."}` | Schedule auto-capture 3 detik kemudian (window untuk countdown 3-2-1 di frontend) |
| `POST /api/robot/webhook` | `{"preset": N, "event": "ended"}` | Reset robot state (`current_preset = 0`, `auto_capture_at = zero`) |

`session_id` opsional — kalau kosong, backend ambil session paid/shooting terbaru dari DB.

### Capture flow di mode Canon

```
Robot → POST /api/robot/done
        │
        ↓ backend schedules goroutine
        ↓ time.Sleep(3s) — frontend tampilkan countdown 3-2-1
        ↓
backend services.TriggerCapture()
        ↓
digiCamControl POST /?CMD=LiveView_Capture
        ↓
backend save JPEG to storage/sessions/{id}/raw/canon_*.jpg
        ↓ insert ke photos table
done.
```

---

## Mode Kamera

Canon-only via digiCamControl. Saat startup ([services/camera.go:CheckCamera](backend/services/camera.go)) backend probe `GET ${DIGICAM_BASE_URL}/camera` + liveview; kalau frame valid → kamera online, kalau tidak → offline (tidak ada lagi fallback webcam laptop).

### Mirror behavior

Backend `flipJPEGHorizontal` mirror JPEG liveview sebelum kirim ke frontend, jadi user lihat preview mirrored (familiar selfie). Hasil foto Canon disimpan apa adanya (natural orientation, tidak di-flip).

---

## Audio Cues

Semua file MP3 di `backend/storage/audio/`. Frontend serve via `${API_URL}/storage/audio/<file>.mp3`.

| File | Trigger | Lokasi kode |
|---|---|---|
| `preset.mp3` | Masuk step gesture-controls di instruction | `InstructionPage.tsx` useEffect |
| `inisiasi.mp3` | Masuk `/photo-session` page | `PhotoSessionPage.tsx` useEffect |
| `presetTerkonfirmasi.mp3` | Robot move ke preset baru (current_preset changes) | `CameraPreview.tsx` polling tick |
| `tiga.mp3` | Countdown detik 3 | `CameraPreview.tsx` audioRefs[3] |
| `dua.mp3` | Countdown detik 2 | `CameraPreview.tsx` audioRefs[2] |
| `satu.mp3` | Countdown detik 1 | `CameraPreview.tsx` audioRefs[1] |

Helper: [`lib/audio.ts:playBackendAudio(filename)`](frontend/src/lib/audio.ts) — caches Audio instances, silent on autoplay block.

---

## Animated GIF Output

Setiap sesi yang sukses compose menghasilkan **dua varian animated GIF** yang bisa di-preview/download dari `/download-photos/{sessionId}`:

### GIF #1 — Slideshow

- File: `storage/sessions/{id}/animation.gif`
- Endpoint: `GET /api/photo/session/{id}/gif` (tambah `?inline=1` untuk preview di `<img>`)
- Isi: rotasi foto raw terpilih (3 foto), 0.7s per frame, loop forever
- Canvas 360×540, palette 256 colors + Floyd-Steinberg dithering supaya gradasi kulit/langit tidak banding parah
- Generator: [`services/gif.go:GenerateSessionGIF`](backend/services/gif.go)

### GIF #2 — Live Strip

- File: `storage/sessions/{id}/animation-live-v2.gif` (suffix `-v2` versioned — bump saat compositing logic berubah supaya cache lama otomatis di-skip)
- Endpoint: `GET /api/photo/session/{id}/gif-live` (tambah `?inline=1` untuk inline preview)
- Availability cek: `GET /api/photo/session/{id}/gif-live/available` → frontend hide tombol kalau tidak available (mis. liveview Canon gagal saat countdown, tidak ada burst frames)
- Isi: framed strip sebagai base, tiap slot foto diisi rentetan burst-frame liveview (3 detik momen sebelum jepret), lalu settle ke foto final
- Compositing: **z-order benar** — burst di-draw di tengah, frame design (extracted dari embedded base64 PNG di SVG) di-overlay ON TOP supaya dekorasi window (rounded corner / border) tidak ke-timpa burst
- Frame yang tidak punya embedded PNG (mis. path-based SVG) gracefully fall back ke compositing lama — di-log dengan `ℹ️  frame overlay: SVG ... tidak punya embedded PNG (non-standar)`
- Generator: [`services/gif_live.go:GenerateLiveStripGIF`](backend/services/gif_live.go)

### Burst capture

Selama 3 detik countdown (antara `POST /api/robot/done` dan shutter trigger), backend men-snapshot liveview frames ke `storage/sessions/{id}/burst/pending/frame_NNN.jpg`. Setelah capture sukses dan `photoID` di-assign, folder pending di-rename ke `burst/{photoID}/` (atomic move).

- Sumber frame = liveview Canon (digiCamControl)
- Interval 280ms, max 12 frames, durasi 3 detik
- Per-frame call wrapped `time.After(560ms)` supaya satu frame lambat tidak nahan loop
- Implementation: [`services/burst.go`](backend/services/burst.go)

### Pre-generation

Saat user submit compose dari photo-editor, backend langsung kick off **kedua generator** di goroutine. Jadi pas user buka halaman download di HP, file GIF umumnya sudah siap (tidak perlu wait 3-5 detik untuk first hit). Lock per-session ([`gifGenLocks`](backend/services/gif.go)) memastikan request paralel tidak race — yang kedua menunggu yang pertama selesai dan reuse cache-nya.

Cache invalidation pakai mtime: kalau framed strip / burst frames / frame SVG ada yang lebih baru dari GIF output, generator regenerate. Jangan-jangan force-bust dengan delete file di `storage/sessions/{id}/animation*.gif`.

---

## Safeguard Sesi Foto

Saat session timer (5 menit di `/photo-session`) habis tepat waktu robot sedang gerak atau countdown shutter masih jalan, **sesi tidak langsung end** — foto terakhir bisa ke-cut di tengah jepretan. Frontend ([`PhotoSessionPage.tsx`](frontend/src/features/public/photo-session/pages/PhotoSessionPage.tsx)) menahan end-effect sampai robot selesai:

```
sessionTimeLeft = 0  AND  robotBusy = false  AND  robotConfigFetched = true
                                ↓
                  → broadcast SESSION_END → disable robot → navigate
```

Selama menunggu, header timer tampil `-MM:SS` (mis. `-00:01`, `-00:02`, …) sebagai indikator overtime. Hard cap **30 detik** mencegah kiosk hang kalau robot stuck atau webhook `/done` tidak fire.

`robotBusy` ditentukan dari poll `/api/robot/config` (shared via `useRobotConfig()` hook — single underlying request, di-konsumsi juga oleh `CameraPreview` untuk countdown overlay):

```ts
robotBusy = (current_preset ?? 0) > 0 || auto_capture_active === true
```

Edge case yang dihandle: kalau halaman refresh tepat saat `sessionTimeLeft` sudah 0 dan `robotConfig` belum sempat fetch, end-effect tahan dulu sampai `isFetched = true` dari React Query — supaya grace check tidak ke-skip.

---

## Testing dengan curl

### Setup session untuk testing

```bash
# Linux/Mac/Git Bash:
SID=$(curl -s -X POST http://localhost:8080/api/session/create \
  -H 'Content-Type: application/json' \
  -d '{"packageId":1,"printCount":0}' | python -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")

curl -s -X PATCH "http://localhost:8080/api/session/$SID/status" \
  -H 'Content-Type: application/json' -d '{"status":"paid"}'

echo "Session ID: $SID"
```

### Trigger auto-capture (simulasi robot done)

```bash
curl -X POST http://localhost:8080/api/robot/done \
  -H 'Content-Type: application/json' \
  -d "{\"preset\":1,\"session_id\":\"$SID\"}"
```

### Cek photos hasil capture

```bash
sleep 4
curl -s "http://localhost:8080/api/photo/session/$SID" | python -m json.tool
```

### Test Windows cmd

Escape quote dengan `\"`:
```cmd
curl -X POST http://localhost:8080/api/robot/done -H "Content-Type: application/json" -d "{\"preset\":1,\"session_id\":\"YOUR_SESSION_ID\"}"
```

---

## Troubleshooting

### Backend tidak start: "Gagal init database"
- Cek `DATABASE_URL` di `.env`
- Pastikan PostgreSQL running: `pg_isready -h localhost`
- Pastikan database `photobooth` sudah dibuat

### Frontend blank saat akses via LAN IP
- Cek `frontend/.env.local` → set `NEXT_PUBLIC_API_URL=` (kosong) atau ke LAN IP yang sama
- Restart `npm run dev` setelah ubah env
- Pastikan `allowedDevOrigins` di `next.config.ts` include IP Anda
- Windows Firewall: allow TCP port 3000 + 8080

### Live preview kosong / "Stream tidak tersedia"
Kamera Canon-only via digiCamControl — kalau preview kosong:
- Pastikan digiCamControl jalan dan kamera Canon terhubung (liveview aktif)
- Cek `DIGICAM_BASE_URL` di `.env` benar (default `http://localhost:5513/api`)
- `/api/robot/status` harus return `connected: true`
- Tes cepat: `go run ./cmd/probecheck` dari folder backend

### QR code di kiosk tidak bisa di-scan dari HP
- QR encode current `window.location.origin` + sessionId
- Kalau kiosk diakses via `localhost:3000`, QR encode `localhost:3000/...` → HP tidak bisa resolve
- Solusi: akses kiosk dari LAN IP, atau set `NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL=http://192.168.x.x:3000` di `frontend/.env.local`

### Audio tidak play
- Browser block autoplay sebelum user interaction
- Pastikan user click tombol minimal 1× sebelum audio trigger
- Cek file ada di `backend/storage/audio/`
- Cek backend serve OK: `curl -I http://localhost:8080/storage/audio/satu.mp3`

### Robot enable gagal "ERR_NGROK_3200"
- `ROBOT_API_URL` di backend `.env` poin ke endpoint offline
- Set `ROBOT_API_URL=` (kosong) atau ke URL robot aktif

### Image Optimizer error "isn't a valid image"
- Jangan pakai `<Image>` dari `next/image` untuk URL dinamis dari backend
- Sudah di-replace semua dengan plain `<img>` (lihat PhotoCard, PackageCard, dll)

### Build production fail "Cross origin request blocked"
- Hanya dev mode yang punya restriction ini
- `npm run build && npm run start` (production) tidak block

### Live Strip GIF: foto burst tampak "diluar frame" di awal animasi
- Bug compositing lama — burst di-draw ON TOP framed strip, ke-timpa frame border
- Sudah fixed: filename output bumped ke `animation-live-v2.gif`, generator overlay frame design di atas burst
- Kalau session lama masih ke-cache buggy version, hapus manual: `rm storage/sessions/<id>/animation-live.gif` (file lama tanpa `-v2` suffix)

### Live Strip GIF kosong / hilang dekorasi frame untuk `frame-165`
- `frame-165.svg` pakai path-based SVG (bukan embedded base64 PNG seperti frame lain)
- `loadFrameOverlay` regex tidak match → gracefully fall back ke compositing lama (burst nimpa frame border)
- Log: `ℹ️  frame overlay: SVG storage/frames/frame-165.svg tidak punya embedded PNG (non-standar)`
- Fix proper: re-export `frame-165` ke format yang sama (embedded base64 PNG di SVG, dimensi 464×696), atau tambah SVG renderer di backend

### Sesi tidak end padahal timer sudah 0
- Safeguard: backend masih sibuk (preset moving atau countdown shutter) — frontend tampil timer negatif `-00:01`, `-00:02`, ...
- Hard cap 30 detik (lihat [Safeguard Sesi Foto](#safeguard-sesi-foto))
- Kalau lebih dari 30s masih stuck: cek `/api/robot/config` — kemungkinan `current_preset` tidak pernah reset (robot webhook `/done` tidak fire ke backend). Reset manual via `POST /api/robot/webhook` dengan `{"event":"ended","preset":N}`.

### Edit frame/paket/voucher balik ke nilai awal setiap restart
- Penyebab (versi lama): seed `init.sql` pakai `ON CONFLICT DO UPDATE` yang menimpa data tiap server boot. Hanya data **default** (frame-164…167, paket regular/vip, 4 voucher) yang terdampak; data baru aman.
- **Sudah fixed:** seed diubah ke `ON CONFLICT DO NOTHING` (insert-only). Pastikan kamu pakai `init.sql` terbaru, lalu restart backend dan edit ulang sekali data yang sempat ke-reset — setelah itu permanen.

### Photo editor crash `Cannot read properties of null (reading 'clearRect')`
- Terjadi saat ganti frame dengan dimensi berbeda — canvas Fabric lama sudah di-dispose tapi masih dipanggil `.clear()`.
- **Sudah fixed:** effect render kini memakai instance canvas hidup via `getFabricCanvas()` (ref), bukan closure basi. Pastikan pakai versi terbaru `PreviewArea.tsx` + `useCanvasRenderer.ts`.

### "Pilih 3 foto dulu" saat klik Confirm di photo-editor
- Slot belum terisi semua (kurang dari 3). Frontend block submit supaya tidak hit error 400 backend
- Drop sisa foto dari panel kiri ke slot kosong di canvas tengah
- Kalau timer 2 menit habis dengan slot belum penuh, otomatis skip save dan navigate ke `/session-end`

---

## Lisensi

Project internal magang Jonas. Bukan untuk distribusi publik.
