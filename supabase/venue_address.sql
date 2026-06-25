-- Venue address + geocoded coordinates
-- Run this in Supabase SQL editor BEFORE deploying the venue registration update.
-- Adds the columns that the updated signup form populates and the admin panel reads.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS venue_address TEXT,
  ADD COLUMN IF NOT EXISTS venue_city    TEXT,
  ADD COLUMN IF NOT EXISTS venue_state   TEXT,
  ADD COLUMN IF NOT EXISTS venue_zip     TEXT,
  ADD COLUMN IF NOT EXISTS venue_lat     FLOAT8,
  ADD COLUMN IF NOT EXISTS venue_lng     FLOAT8,
  ADD COLUMN IF NOT EXISTS venue_type    TEXT;
