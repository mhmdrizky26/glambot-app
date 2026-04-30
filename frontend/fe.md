# Frontend Architecture Map

Frontend ini sudah cukup dekat ke pola feature-based. Folder `src/app` hanya menangani routing, sedangkan logika utama ada di `src/features/public/*`. Supaya backend nanti gampang masuk, pemisahan paling penting adalah: UI di feature, request data di API layer, dan contract data di satu tempat yang jelas.

## 1. Pembagian Besar

### Routing
- `src/app/` berisi route Next.js saja.
- Hampir semua file route hanya me-reexport page dari feature.
- Contoh: `/`, `/package`, `/payment/summary`, `/payment/pay`, `/instruction`, `/photo-session`.

### Feature UI
- `src/features/public/home` untuk landing page.
- `src/features/public/package` untuk pilih paket dan create session.
- `src/features/public/payment` untuk summary, voucher, create payment, dan status payment.
- `src/features/public/instruction` untuk step instruksi sebelum sesi kamera.
- `src/features/public/photo-session` untuk camera preview dan gesture control.

### Shared UI / Infra
- `src/components/ui/` berisi komponen dasar seperti button, input, dialog.
- `src/components/shared/` berisi komponen reusable yang dipakai lintas feature seperti `GlassCard`, `Timer`, dan animasi status.
- `src/lib/` berisi utilitas infra: axios client, format rupiah, config react-query, helper umum.
- `src/shared/api/` berisi API yang dipakai lintas feature, sekarang terutama session.

### Testing / Mock
- `src/testing/mocks/` berisi MSW database, handler, dan initial setup.
- Ini sekarang menjadi sumber kontrak backend palsu yang paling dekat dengan endpoint asli.

## 2. Alur Data Utama

### A. Home -> Package
- Home hanya tombol masuk ke `/package`.
- `PackagePage` memanggil `usePackages()` untuk ambil daftar paket.
- Kalau paket bertipe print, user isi jumlah print dulu.
- Setelah pilih paket, frontend memanggil `useCreateSession()`.

### B. Package -> Summary
- Session yang dibuat redirect ke `/payment/summary?sessionId=...`.
- `SummaryPage` memanggil `useGetSession()` untuk ambil detail session.
- Voucher di-handle oleh `useVoucher()` yang memakai API apply voucher.
- Kalau voucher sukses, session query di-refresh supaya total harga ikut berubah.

### C. Summary -> Payment
- Tombol proceed pindah ke `/payment/pay?sessionId=...`.
- `PayPage` memanggil `PaymentStatus`.
- `usePayment()` membuat payment, polling status transaksi, lalu update session status.
- Setelah status sukses, flow pindah ke `/instruction`.

### D. Instruction -> Photo Session
- `InstructionPage` menampilkan step instruksi.
- Step terakhir mengubah status session ke `shooting`.
- Setelah itu user diarahkan ke `/photo-session`.
- `PhotoSessionPage` sekarang masih lokal: kamera, timer, dan gesture belum terhubung ke backend.

## 3. API Yang Sudah Terlihat Dari Frontend

Endpoint yang sudah dipakai frontend saat ini:

- `GET /api/package` untuk daftar paket.
- `POST /api/session` untuk create session.
- `GET /api/session/:sessionId` untuk detail session.
- `PATCH /api/session/:sessionId/status` untuk update status session.
- `POST /api/payment` untuk create payment.
- `GET /api/payment/:midtransOrderId/status` untuk cek status payment.
- `POST /api/voucher/apply` untuk validasi dan apply voucher.

Endpoint yang belum ada di frontend, tapi kemungkinan akan dibutuhkan backend nanti:

- upload frame / foto session.
- ambil hasil foto session.
- finalisasi session atau complete session.
- sinkronisasi gesture / event kamera kalau mau dipindah ke backend.

## 4. Titik File Yang Paling Penting

- `src/lib/api-client.ts` adalah pintu semua request HTTP.
- `src/shared/api/session.ts` adalah API session lintas feature.
- `src/features/public/package/api/*` adalah data paket.
- `src/features/public/payment/api/*` adalah payment dan voucher.
- `src/features/public/payment/hooks/usePayment.ts` adalah state machine pembayaran.
- `src/testing/mocks/handlers/*.ts` adalah simulasi backend saat development.

## 5. Pemisahan Yang Paling Aman Untuk Backend

Frontend ini sebenarnya sudah cukup dekat ke struktur yang rapi. Yang perlu dijaga supaya backend gampang masuk adalah aturan berikut:

1. Route hanya untuk navigasi.
2. Page hanya merangkai feature, jangan taruh request langsung di route.
3. Semua request backend tetap lewat API layer di `src/shared/api` atau `src/features/*/api`.
4. Type request dan response jangan ditulis ulang di component.
5. Logic polling, redirect, dan transform data tetap di hook, bukan di UI murni.

## 6. Rekomendasi Struktur Kalau Backend Sudah Siap

Kalau backend mulai dikerjakan, struktur berikut paling enak dipakai:

- `src/lib/` untuk infra umum.
- `src/shared/api/` untuk contract yang dipakai lintas fitur.
- `src/features/<feature>/api/` untuk endpoint khusus feature.
- `src/features/<feature>/hooks/` untuk flow state dan query mutation.
- `src/features/<feature>/components/` untuk UI feature.
- `src/features/<feature>/pages/` untuk komposisi halaman.

Dengan pola ini, backend cukup mengganti implementasi endpoint di API layer tanpa mengubah banyak UI.

## 7. Catatan Praktis

- Frontend ini belum benar-benar tergantung backend nyata karena banyak endpoint masih dimock MSW.
- Jadi saat backend masuk, yang paling penting adalah menyamakan nama field dan response shape.
- Bagian paling rawan biasanya session, payment status, dan voucher response.
