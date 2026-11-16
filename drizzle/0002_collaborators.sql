CREATE TABLE IF NOT EXISTS site_admins (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_admins (email, added_by)
SELECT email, id FROM users ORDER BY created_at ASC LIMIT 1;
