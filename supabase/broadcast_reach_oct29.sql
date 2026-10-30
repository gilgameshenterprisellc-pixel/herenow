-- ═══════════════════════════════════════════════════════════════════════════
-- BROADCAST REACH (Jacob, Oct 29 2026). Run once in Supabase, BEFORE merging
-- the app change that reads these columns (feat/broadcast-reach).
--
--   1. Announcements can be scheduled: publish_at (when it goes out).
--      Existing rows get their created_at. New rows default to now().
--   2. A scheduled announcement stays hidden from everyone except the venue
--      owner until its time, in the database, not just in the app.
--   3. Followers can mute a venue: venue_subscriptions.muted.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Scheduling ───────────────────────────────────────────────────────────
ALTER TABLE venue_announcements ADD COLUMN IF NOT EXISTS publish_at timestamptz;
UPDATE venue_announcements SET publish_at = COALESCE(created_at, now()) WHERE publish_at IS NULL;
ALTER TABLE venue_announcements ALTER COLUMN publish_at SET DEFAULT now();
ALTER TABLE venue_announcements ALTER COLUMN publish_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_announcements_zone_publish
  ON venue_announcements (zone_id, publish_at DESC);

-- ── 2. Hide scheduled announcements until they go out ───────────────────────
-- Replaces the original "viewable by all" policy (supabase/venue_subscriptions.sql).
DROP POLICY IF EXISTS "Announcements viewable by all" ON venue_announcements;
DROP POLICY IF EXISTS "Announcements viewable once published" ON venue_announcements;
CREATE POLICY "Announcements viewable once published" ON venue_announcements FOR SELECT
  USING (
    publish_at <= now()
    OR EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid())
  );

-- ── 3. Mute a followed venue ────────────────────────────────────────────────
-- Covered by the existing "Users can manage own subscriptions" policy (FOR ALL).
ALTER TABLE venue_subscriptions ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect: publish_at | timestamp with time zone | NO,  muted | boolean | NO
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE (table_name, column_name) IN (('venue_announcements','publish_at'), ('venue_subscriptions','muted'));
