ALTER TABLE galleries ADD COLUMN polaroid_expires_at TEXT;

CREATE TABLE IF NOT EXISTS polaroid_photos (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_polaroid_gallery_order
ON polaroid_photos (gallery_id, sort_order);
