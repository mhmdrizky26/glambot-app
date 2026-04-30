-- PostgreSQL schema for Glambot / Jonas Photo
-- Compatibility-first migration from SQLite:
-- - keep existing column/table names used by current handlers
-- - add normalized master tables (`packages`, `frames`) for admin monitoring

CREATE TABLE IF NOT EXISTS packages (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  base_price INTEGER NOT NULL CHECK (base_price >= 0),
  duration_secs INTEGER NOT NULL CHECK (duration_secs > 0),
  print_count SMALLINT NOT NULL DEFAULT 3 CHECK (print_count > 0),
  image_src TEXT,
  is_popular INTEGER NOT NULL DEFAULT 0 CHECK (is_popular IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  thumb_url TEXT NOT NULL,
  photo_slots INTEGER NOT NULL DEFAULT 3,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  package_id BIGINT REFERENCES packages(id),
  package_code TEXT NOT NULL,
  duration_secs INTEGER NOT NULL,
  price INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  final_price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'shooting', 'completed', 'expired')),
  frame_id TEXT,
  print_count INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  midtrans_order_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  qris_url TEXT,
  qris_raw_string TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vouchers (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL,
  min_price INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voucher_usage (
  id TEXT PRIMARY KEY,
  voucher_code TEXT NOT NULL REFERENCES vouchers(code),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('raw', 'framed')),
  selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_active_sort ON packages (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_frames_active_sort ON frames (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_sessions_package_id ON sessions (package_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions (session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_photos_session_id_type ON photos (session_id, type);
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers (is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_session_id ON voucher_usage (session_id);

INSERT INTO packages (
  code, name, description, base_price, duration_secs, print_count, image_src, is_popular, is_active, sort_order
)
VALUES
  ('regular', 'Regular', '5 menit sesi foto, cetak 3 strip', 35000, 300, 3, NULL, 0, 1, 1),
  ('vip', 'VIP', '8 menit sesi foto, cetak 3 strip, prioritas antrian', 45000, 480, 3, NULL, 1, 1, 2)
ON CONFLICT (code) DO NOTHING;
