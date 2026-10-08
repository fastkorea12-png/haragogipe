CREATE TABLE IF NOT EXISTS question_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  normalized TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS question_log_recent ON question_log(created_at);
CREATE INDEX IF NOT EXISTS question_log_group ON question_log(normalized, created_at);
