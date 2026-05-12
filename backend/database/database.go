package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

type DBWrapper struct {
	inner *sql.DB
}

type TxWrapper struct {
	inner *sql.Tx
}

var DB *DBWrapper

func (d *DBWrapper) Exec(query string, args ...interface{}) (sql.Result, error) {
	return d.inner.Exec(rebindPostgres(query), args...)
}

func (d *DBWrapper) Query(query string, args ...interface{}) (*sql.Rows, error) {
	return d.inner.Query(rebindPostgres(query), args...)
}

func (d *DBWrapper) QueryRow(query string, args ...interface{}) *sql.Row {
	return d.inner.QueryRow(rebindPostgres(query), args...)
}

func (d *DBWrapper) Begin() (*TxWrapper, error) {
	tx, err := d.inner.Begin()
	if err != nil {
		return nil, err
	}
	return &TxWrapper{inner: tx}, nil
}

func (d *DBWrapper) Close() error {
	return d.inner.Close()
}

func (tx *TxWrapper) Exec(query string, args ...interface{}) (sql.Result, error) {
	return tx.inner.Exec(rebindPostgres(query), args...)
}

func (tx *TxWrapper) Query(query string, args ...interface{}) (*sql.Rows, error) {
	return tx.inner.Query(rebindPostgres(query), args...)
}

func (tx *TxWrapper) QueryRow(query string, args ...interface{}) *sql.Row {
	return tx.inner.QueryRow(rebindPostgres(query), args...)
}

func (tx *TxWrapper) Commit() error {
	return tx.inner.Commit()
}

func (tx *TxWrapper) Rollback() error {
	return tx.inner.Rollback()
}

func Init(databaseURL string) error {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	DB = &DBWrapper{inner: db}
	log.Printf("✅ Database connected: %s", sanitizeDatabaseURL(databaseURL))

	return runMigrations(DB)
}

func applyCompatibilityMigrations(db *DBWrapper) error {
	statements := []string{
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS package_code TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ALTER COLUMN category SET DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS discount INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS final_price INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS print_count INTEGER NOT NULL DEFAULT 3`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qris_url TEXT`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qris_raw_string TEXT`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS min_price INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS max_uses INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
	}

	for _, statement := range statements {
		if _, err := db.inner.Exec(statement); err != nil {
			return err
		}
	}

	if _, err := db.inner.Exec(`
		UPDATE sessions
		SET package_code = COALESCE(package_code, ''),
		    category = COALESCE(category, package_code, ''),
		    discount = COALESCE(discount, 0),
		    final_price = COALESCE(final_price, price),
		    print_count = COALESCE(print_count, 3)
	`); err != nil {
		return err
	}

	return nil
}

func runMigrations(db *DBWrapper) error {
	schemaPaths := []string{
		"migrations/init.sql",
		"backend/migrations/init.sql",
	}

	var schemaSQL string
	for _, path := range schemaPaths {
		b, err := os.ReadFile(path)
		if err == nil {
			schemaSQL = string(b)
			break
		}
	}

	if schemaSQL == "" {
		return fmt.Errorf("migrations/init.sql not found")
	}

	if _, err := db.inner.Exec(schemaSQL); err != nil {
		return fmt.Errorf("failed to apply postgres schema: %w", err)
	}

	if err := applyCompatibilityMigrations(db); err != nil {
		return fmt.Errorf("failed to apply compatibility migrations: %w", err)
	}

	log.Println("✅ PostgreSQL schema applied")
	return nil
}

func Close() {
	if DB != nil {
		_ = DB.Close()
	}
}

func sanitizeDatabaseURL(raw string) string {
	idx := strings.Index(raw, "@")
	if idx == -1 {
		return raw
	}
	left := raw[:idx]
	if creds := strings.LastIndex(left, "://"); creds != -1 {
		return raw[:creds+3] + "***:***" + raw[idx:]
	}
	return "postgres://***:***" + raw[idx:]
}

func rebindPostgres(query string) string {
	var b strings.Builder
	b.Grow(len(query) + 16)

	arg := 1
	inSingle := false
	inDouble := false

	for i := 0; i < len(query); i++ {
		ch := query[i]

		if ch == '\'' && !inDouble {
			if inSingle && i+1 < len(query) && query[i+1] == '\'' {
				b.WriteByte(ch)
				i++
				b.WriteByte(query[i])
				continue
			}
			inSingle = !inSingle
			b.WriteByte(ch)
			continue
		}

		if ch == '"' && !inSingle {
			inDouble = !inDouble
			b.WriteByte(ch)
			continue
		}

		if ch == '?' && !inSingle && !inDouble {
			b.WriteString(fmt.Sprintf("$%d", arg))
			arg++
			continue
		}

		b.WriteByte(ch)
	}

	return b.String()
}
