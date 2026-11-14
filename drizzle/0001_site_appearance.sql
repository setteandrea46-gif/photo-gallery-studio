ALTER TABLE site_settings ADD COLUMN intro_photo_key TEXT;
ALTER TABLE site_settings ADD COLUMN background_color TEXT NOT NULL DEFAULT '#0a0805';
ALTER TABLE site_settings ADD COLUMN text_color TEXT NOT NULL DEFAULT '#f5f0e8';
