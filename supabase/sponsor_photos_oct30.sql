-- ═══════════════════════════════════════════════════════════════════════════
-- SPONSOR PHOTOS (Jacob, Oct 30 2026). Run once in Supabase, BEFORE merging
-- feat/sponsor-photos. Needs supabase/venue_partners_oct30.sql already run.
--
-- "Definitely allow photos in sponsor broadcasts, just like venue
-- announcements. Visual content will be especially important for brands like
-- Monster." The photo is uploaded to the venue-media bucket, the same place
-- venue announcement and Pulse photos go; this column holds its public URL.
-- Every existing policy on partner_broadcasts already covers the new column.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE partner_broadcasts ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE partner_broadcasts DROP CONSTRAINT IF EXISTS partner_broadcasts_image_url_https;
ALTER TABLE partner_broadcasts ADD CONSTRAINT partner_broadcasts_image_url_https
  CHECK (image_url IS NULL OR image_url LIKE 'https://%');

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect one row: image_url, text.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'partner_broadcasts' AND column_name = 'image_url';
