-- Follow vs Subscribe split (Jacob, July 7 2026). Run once in Supabase SQL editor.
--
-- Follow    = a venue_subscriptions row (from anywhere).
-- Subscribe = that row with is_subscriber = true (set only while checked in).
-- Promos/announcements can target 'all' (followers) or 'subscribers'.

-- 1. Subscriber flag on the follow row
ALTER TABLE venue_subscriptions
  ADD COLUMN IF NOT EXISTS is_subscriber BOOLEAN DEFAULT FALSE;

-- 2. One row per (user, venue) — needed for the follow/subscribe upserts
--    (safe if a duplicate index/constraint already exists)
CREATE UNIQUE INDEX IF NOT EXISTS venue_subscriptions_user_zone_uidx
  ON venue_subscriptions (user_id, zone_id);

-- 3. Audience targeting on venue posts
ALTER TABLE venue_promotions
  ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'all';   -- 'all' | 'subscribers'
ALTER TABLE venue_announcements
  ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'all';
