-- Add profile photo and banner photo columns to zones table
ALTER TABLE zones ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT NULL;
