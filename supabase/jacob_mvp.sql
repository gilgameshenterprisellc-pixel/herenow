-- Jacob MVP batch 1 — private demographics + write-in interests
-- Run in Supabase SQL editor before deploying this branch.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender        TEXT,
  ADD COLUMN IF NOT EXISTS interest_text TEXT;
