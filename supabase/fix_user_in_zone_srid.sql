-- Fix user_in_zone() — SRID-safe, boundary-inclusive polygon check (July 2026).
-- Run once in Supabase. Supersedes the user_in_zone() defined in
-- polygon_geofencing.sql.
--
-- ── The bug ────────────────────────────────────────────────────────────────────
-- The polygon branch built the test point with ST_Point(lng, lat), which returns
-- a geometry with SRID 0 (unknown), and compared it against building_polygon
-- (geography, SRID 4326) cast to geometry (SRID 4326):
--
--     ST_Contains(z.building_polygon::geometry, ST_Point(user_lng, user_lat)::geometry)
--                 ^ SRID 4326                     ^ SRID 0
--
-- PostGIS rejects binary predicates on mixed SRIDs ("Operation on mixed SRID
-- geometries"). So for ANY venue that actually has a building_polygon, this RPC
-- raised inside Postgres, checkUserInZone() caught the error and returned false,
-- and check-in was impossible at that venue. In practice this meant the polygon
-- gate never fired: venues with a polygon were un-checkinable, and venues without
-- one silently fell through to the radius circle — which is why tuning the radius
-- (14m reaches the parking lot, 13m doesn't) still changed behavior even though we
-- "polygon-geofenced the building". The polygon was never actually being used.
--
-- Secondary bug: ST_Contains returns FALSE for a point exactly on the polygon
-- boundary (the building's wall). Someone standing against the outer wall could be
-- rejected. ST_Covers is boundary-inclusive and is the correct predicate here.
--
-- ── The fix ────────────────────────────────────────────────────────────────────
-- Build the point as geography(4326) and use ST_Covers(geography, geography) so
-- both operands share SRID 4326 and boundary points count as inside. When a
-- polygon exists, radius_meters is ignored entirely — the building footprint IS
-- the geofence. Venues with no polygon keep the circle fallback unchanged.

CREATE OR REPLACE FUNCTION user_in_zone(zone_id uuid, user_lat float, user_lng float)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  z  RECORD;
  pt geography;
BEGIN
  SELECT center, radius_meters, building_polygon
  INTO z
  FROM zones
  WHERE id = zone_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Explicit SRID 4326, cast to geography — matches building_polygon's type/SRID.
  pt := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

  IF z.building_polygon IS NOT NULL THEN
    -- Polygon-first: the building footprint is the geofence. radius_meters is
    -- irrelevant here. ST_Covers is boundary-inclusive (points on the wall pass).
    RETURN ST_Covers(z.building_polygon, pt);
  END IF;

  -- No polygon on this venue yet — fall back to the circle radius.
  RETURN ST_DWithin(z.center::geography, pt, z.radius_meters);
END;
$$;
