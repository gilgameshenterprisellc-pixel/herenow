-- Geofence accuracy margin for user_in_zone() (Jul 2026).
-- Run once in Supabase. Supersedes fix_user_in_zone_srid.sql.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- The check was hard-edged: a point had to fall on/inside the polygon (or within
-- radius) with zero tolerance. Consumer GPS jitters several metres, so:
--   • Standing at the building wall, the fix center lands a few metres outside →
--     check-in fails ("couldn't check in by the outside or inside wall").
--   • A stationary user near the edge gets consecutive fixes that jitter just
--     outside → the presence verifier evicts them ("got booted at the bar").
--
-- Adding an optional margin_m lets callers expand the effective geofence by a
-- buffer. Check-in passes a small margin (edge tolerance); the presence verifier
-- passes a larger one (only evict when CLEARLY outside) — the gap between the two
-- is a hysteresis band: you're let in tighter than you're kicked out.
--
-- ST_DWithin(geog, geog, d) is boundary-inclusive and, with d = 0, is exactly the
-- old ST_Covers behaviour — so margin_m defaults to 0 and existing 3-arg callers
-- are unchanged.

-- Drop the old 3-arg signature so the new defaulted 4-arg version isn't ambiguous
-- when called with three args.
DROP FUNCTION IF EXISTS user_in_zone(uuid, float, float);

CREATE OR REPLACE FUNCTION user_in_zone(
  zone_id  uuid,
  user_lat float,
  user_lng float,
  margin_m float DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  z  RECORD;
  pt geography;
  m  float;
BEGIN
  SELECT center, radius_meters, building_polygon
  INTO z
  FROM zones
  WHERE id = zone_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  m  := GREATEST(COALESCE(margin_m, 0), 0);
  pt := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

  IF z.building_polygon IS NOT NULL THEN
    -- Polygon-first: within m metres of the building footprint (m=0 => on/inside,
    -- matching the old boundary-inclusive ST_Covers).
    RETURN ST_DWithin(z.building_polygon, pt, m);
  END IF;

  -- Circle fallback: within radius + margin of the venue center.
  RETURN ST_DWithin(z.center::geography, pt, z.radius_meters + m);
END;
$$;
