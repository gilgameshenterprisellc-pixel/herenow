-- Jacob Sprint 3
-- Run in Supabase SQL Editor

-- 1. Venue gallery user submissions: status column for approval workflow
ALTER TABLE venue_photos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_note TEXT DEFAULT NULL;

-- Index for fast owner-pending-review queries
CREATE INDEX IF NOT EXISTS venue_photos_status_idx ON venue_photos(zone_id, status);
