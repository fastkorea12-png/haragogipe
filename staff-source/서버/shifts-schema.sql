CREATE TABLE IF NOT EXISTS shift_receipts (id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, saved_at TEXT);
CREATE INDEX IF NOT EXISTS shift_receipts_created_at ON shift_receipts(created_at);
