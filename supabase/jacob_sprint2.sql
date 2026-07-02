-- Jacob Sprint 2
-- Run in Supabase SQL Editor

-- 1. Venue temporarily closed mode
ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS is_temporarily_closed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temporary_closure_message TEXT DEFAULT NULL;

-- 2. Promotion time windows (optional start / end scheduling)
ALTER TABLE venue_promotions
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ DEFAULT NULL;
