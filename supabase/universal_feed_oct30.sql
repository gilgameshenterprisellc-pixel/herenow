-- ═══════════════════════════════════════════════════════════════════════════
-- UNIVERSAL FEED (Jacob, Oct 29 2026). Run once in Supabase, BEFORE merging
-- feat/universal-feed.
--
-- A venue can send up to 3 broadcasts per rolling 7 days to everyone in its
-- city, beyond its followers and tonight's guests. City-specific: a Nashville
-- venue's public broadcast only shows in Nashville's feed. Free for now; later
-- it can become part of the paid venue tiers.
--
--   1. cities: the markets that have a Universal Feed (Nashville to start).
--   2. zones.city_slug: which city a venue is in, set from its location.
--   3. universal_broadcasts: one row per broadcast sent to the city, so the
--      weekly limit can't be dodged by deleting and re-posting.
--   4. A guard on both broadcast tables that enforces the limit in the database.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cities ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cities (
  slug       text PRIMARY KEY,
  name       text NOT NULL,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  -- How far from the center still counts as this city, for venues and viewers.
  radius_km  numeric NOT NULL DEFAULT 60
);
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cities readable by all" ON cities;
CREATE POLICY "Cities readable by all" ON cities FOR SELECT USING (true);

-- Downtown Nashville. 60km takes in Franklin, Brentwood, Hendersonville and Murfreesboro.
INSERT INTO cities (slug, name, lat, lng, radius_km)
VALUES ('nashville', 'Nashville', 36.1627, -86.7816, 60)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Each venue's city ────────────────────────────────────────────────────
ALTER TABLE zones ADD COLUMN IF NOT EXISTS city_slug text REFERENCES cities(slug) ON DELETE SET NULL;

-- The nearest city whose radius covers the point, or NULL.
CREATE OR REPLACE FUNCTION city_for_point(p geography)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT c.slug FROM cities c
  WHERE ST_DWithin(p, ST_Point(c.lng, c.lat)::geography, c.radius_km * 1000)
  ORDER BY ST_Distance(p, ST_Point(c.lng, c.lat)::geography)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION zones_set_city()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.center IS NOT NULL THEN NEW.city_slug := city_for_point(NEW.center); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zones_set_city_trg ON zones;
CREATE TRIGGER zones_set_city_trg
  BEFORE INSERT OR UPDATE OF center ON zones
  FOR EACH ROW EXECUTE FUNCTION zones_set_city();

UPDATE zones SET city_slug = city_for_point(center) WHERE center IS NOT NULL;

-- ── 3. The ledger the weekly limit counts ───────────────────────────────────
CREATE TABLE IF NOT EXISTS universal_broadcasts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id       uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('announcement', 'promotion')),
  broadcast_id  uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_universal_broadcasts_zone
  ON universal_broadcasts (zone_id, created_at DESC);
ALTER TABLE universal_broadcasts ENABLE ROW LEVEL SECURITY;
-- The venue owner reads its own rows to show "2 of 3 left this week".
-- Writes come only from the guard below.
DROP POLICY IF EXISTS "Venue owner reads own universal broadcasts" ON universal_broadcasts;
CREATE POLICY "Venue owner reads own universal broadcasts" ON universal_broadcasts FOR SELECT
  USING (EXISTS (SELECT 1 FROM zones z WHERE z.id = universal_broadcasts.zone_id AND z.owner_id = auth.uid()));

-- ── 4. The guard ────────────────────────────────────────────────────────────
-- Runs before a broadcast is saved with post_to_feed = true. The limit (3) and
-- window (7 days) match lib/universalFeed.ts.
CREATE OR REPLACE FUNCTION universal_broadcast_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used int;
BEGIN
  IF NOT COALESCE(NEW.post_to_feed, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.audience, 'all') = 'subscribers' THEN
    RAISE EXCEPTION 'universal_feed_needs_everyone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM zones WHERE id = NEW.zone_id AND city_slug IS NOT NULL) THEN
    RAISE EXCEPTION 'universal_feed_no_city';
  END IF;
  -- One venue posting twice at once can't both squeeze into the last slot.
  PERFORM pg_advisory_xact_lock(hashtext('universal_feed:' || NEW.zone_id::text));
  SELECT count(*) INTO v_used FROM universal_broadcasts
  WHERE zone_id = NEW.zone_id AND created_at > now() - interval '7 days';
  IF v_used >= 3 THEN RAISE EXCEPTION 'universal_feed_limit'; END IF;
  INSERT INTO universal_broadcasts (zone_id, kind, broadcast_id)
  VALUES (NEW.zone_id, TG_ARGV[0], NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS venue_announcements_universal_guard ON venue_announcements;
CREATE TRIGGER venue_announcements_universal_guard
  BEFORE INSERT ON venue_announcements
  FOR EACH ROW EXECUTE FUNCTION universal_broadcast_guard('announcement');

DROP TRIGGER IF EXISTS venue_promotions_universal_guard ON venue_promotions;
CREATE TRIGGER venue_promotions_universal_guard
  BEFORE INSERT ON venue_promotions
  FOR EACH ROW EXECUTE FUNCTION universal_broadcast_guard('promotion');

-- Old rows saved with the dead "post to universal feed" switch (removed in
-- PR #302) never reached anyone. Clear them so they don't surface now.
UPDATE venue_announcements SET post_to_feed = false WHERE post_to_feed;
UPDATE venue_promotions    SET post_to_feed = false WHERE post_to_feed;

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect each venue with its city ('nashville' for the Nashville venues, NULL
-- for anything outside a city, like the App Review demo venue).
SELECT name, city_slug FROM zones ORDER BY city_slug NULLS LAST, name;
