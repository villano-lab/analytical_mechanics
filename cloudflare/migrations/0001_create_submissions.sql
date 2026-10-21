CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_name TEXT NOT NULL,
  vertical_drop REAL NOT NULL,
  submission_id TEXT NOT NULL,
  travel_time REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_name, vertical_drop, submission_id)
);

CREATE INDEX IF NOT EXISTS submissions_lookup
  ON submissions (session_name, vertical_drop, created_at);
