-- Keep zones.polygon_wkt in step with zones.building_polygon.
--
-- The bug (Jacob, Oct 28): a geofence drawn in the admin panel "saved" but the
-- map still showed a radius circle for Lakeside Lounge, Lost & Found and The
-- 5 Spot. Only Martha My Dear showed its outline.
--
-- Why: building_polygon (geography) is the real fence that check-in gates on.
-- polygon_wkt (text) is a copy the app reads to DRAW the outline, because the
-- JS client cannot decode PostGIS binary. add_polygon_wkt.sql (Jul 2) made
-- admin_save_polygon write both. venue_polygon_canonical.sql (Aug 4) rewrote
-- admin_save_polygon and dropped the polygon_wkt line, so every shape saved
-- since then reached the fence but never reached the map. Martha's copy was
-- written before that.
--
-- It was not only cosmetic. The Nearby screen uses polygon_wkt to decide
-- whether a venue is a polygon venue: without it, "Enter Venue" only showed
-- within ~13m of the pin (10m radius x 1.3), so people standing inside those
-- three venues were told "You're not at this venue yet". Check-in itself was
-- fine; it reads building_polygon and polygon_source.
--
-- Fix: polygon_wkt is now DERIVED. A trigger rewrites it from building_polygon
-- on every insert and every update of either column, so no writer can forget
-- it again. It holds the outer edge of the largest part as a plain
-- POLYGON((lng lat, ...)), the only shape the shipped app can draw.
--
-- Safe to re-run. Runs after zones_repair_building_polygon_trg, because
-- Postgres fires BEFORE triggers in name order ('zones_r...' < 'zones_s...'),
-- so it reads the repaired shape.

-- 1. The display outline for a footprint. NULL when there is no footprint.
CREATE OR REPLACE FUNCTION zone_display_wkt(p_polygon geography)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT ST_AsText(ST_MakePolygon(ST_ExteriorRing(part.geom)))
  FROM (SELECT (ST_Dump(p_polygon::geometry)).geom AS geom) AS part
  WHERE GeometryType(part.geom) = 'POLYGON'
  ORDER BY ST_Area(part.geom) DESC
  LIMIT 1
$$;

-- 2. Every write to either column re-derives the copy.
CREATE OR REPLACE FUNCTION zones_sync_polygon_wkt()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.polygon_wkt := zone_display_wkt(NEW.building_polygon);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zones_sync_polygon_wkt_trg ON zones;
CREATE TRIGGER zones_sync_polygon_wkt_trg
  BEFORE INSERT OR UPDATE OF building_polygon, polygon_wkt ON zones
  FOR EACH ROW
  EXECUTE FUNCTION zones_sync_polygon_wkt();

-- 3. Backfill the rows that drifted (Lakeside Lounge, Lost & Found, The 5 Spot
--    as of Oct 28). Rows already in step are left alone.
UPDATE zones
SET polygon_wkt = zone_display_wkt(building_polygon)
WHERE polygon_wkt IS DISTINCT FROM zone_display_wkt(building_polygon);

-- 4. Check: every venue with a footprint should now have an outline.
SELECT name,
       is_active,
       polygon_source,
       (building_polygon IS NOT NULL) AS has_footprint,
       (polygon_wkt IS NOT NULL)      AS has_outline,
       left(polygon_wkt, 40)          AS outline_start
FROM zones
ORDER BY name;
