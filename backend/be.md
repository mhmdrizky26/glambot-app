# PostgreSQL Schema Draft

Skema ini menormalkan backend menjadi PostgreSQL dan memindahkan data yang sebelumnya hardcoded agar bisa di-monitor dari admin.

## Nama tabel final

| Lama | Baru | Catatan |
|---|---|---|
| `packages` | `packages` | Dipakai untuk package/price/duration yang dipilih user. |
| `voucher_usage` | `voucher_usage` | Dipertahankan sementara agar kompatibel dengan handler yang ada. |
| `sessions` | `sessions` | Tetap, tetapi sekarang refer ke `packages` dan `frames`. |
| `transactions` | `transactions` | Tetap, karena sudah cukup jelas untuk payment history. |
| `photos` | `photos` | Tetap, menyimpan raw/framed photo. |
| `vouchers` | `vouchers` | Tetap, untuk master voucher. |
| `frames` | `frames` | Baru, untuk daftar frame yang bisa diadmini. |

## Ringkasan relasi

- `packages` menyimpan paket Regular/VIP dan jadi sumber data harga, durasi, dan jumlah print.
- `sessions` menyimpan snapshot harga, status, voucher, dan frame yang dipakai per sesi.
- `transactions` menyimpan histori pembayaran Midtrans atau pembayaran gratis.
- `vouchers` dan `voucher_usage` menyimpan master voucher dan pemakaian per sesi.
- `frames` menyimpan master frame agar bisa dimonitor dan diubah dari admin.
- `photos` menyimpan raw image dan framed output per sesi.

## File acuan

- Skema SQL PostgreSQL lengkap ada di [backend/schema.postgres.sql](backend/schema.postgres.sql).

## Catatan implementasi

- Frontend React yang sudah ada bisa diarahkan ke `packages` lewat `packageId`.
- Data package tidak perlu hardcoded lagi.
- Admin bisa membaca package, frame, session, transaction, voucher, dan photo langsung dari DB.
