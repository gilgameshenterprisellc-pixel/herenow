-- Geofence hardening (Jul 2026). Run once in Supabase; then re-run
-- supabase/geofence_tests.sql to confirm the assertions still pass.
--
-- Closes two audit items (docs/geofence-reliability-audit.md) without touching
-- any RPC body or the user_in_zone() logic:
--
--   1. Invalid OSM polygons. A self-intersecting / badly-wound footprint can make
--      ST_DWithin containment wrong. We repair every polygon on write with
--      ST_MakeValid, keeping only polygonal parts.
--   2. Multi-part venues (patio + interior, upstairs + downstairs). The column was
--      geography(POLYGON) — a single ring only. We widen it to a generic geography
--      so a MULTIPOLYGON footprint is allowed.
--
-- Why this is low-risk:
--   • The column becomes generic `geography`, which accepts BOTH polygons and
--     multipolygons, so the existing admin_setup_zone / auto_approve_venue RPCs
--     (which insert a POLYGON) keep working unchanged — no type-mismatch.
--   • user_in_zone() uses ST_DWithin(building_polygon, pt, m), which works
--     identically on a polygon or a multipolygon. No function change needed.
--   • The trigger normalizes any repaired geometry to a MULTIPOLYGON via
--     ST_CollectionExtract(..., 3), which always fits the generic column.
--   • Idempotent: safe to run more than once.

-- 1. Widen the column so multi-part footprints are allowed and no writer breaks.
ALTER TABLE zones
  ALTER COLUMN building_polygon TYPE geography
  USING building_polygon::geography;

-- 2. Repair-on-write: validate and normalize any footprint before it is stored,
--    so an invalid OSM outline can never reach the containment check.
CREATE OR REPLACE FUNCTION zones_repair_building_polygon()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.building_polygon IS NOT NULL THEN
    -- ST_MakeValid fixes self-intersections / bad winding; CollectionExtract(,3)
    -- keeps only polygonal parts and yields a MULTIPOLYGON (fits the generic
    -- geography column and works for multi-part venues).
    NEW.building_polygon :=
      ST_CollectionExtract(ST_MakeValid(NEW.building_polygon::geometry), 3)::geography;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zones_repair_building_polygon_trg ON zones;
CREATE TRIGGER zones_repair_building_polygon_trg
  BEFORE INSERT OR UPDATE OF building_polygon ON zones
  FOR EACH ROW
  EXECUTE FUNCTION zones_repair_building_polygon();

-- 3. Coverage check: active venues with no footprint polygon fall back to the
--    circle radius, which is the main adjacent-venue-bleed risk in dense areas.
--    Give these a real polygon before/at soft launch.
SELECT id, name, radius_meters
FROM zones
WHERE is_active = true
  AND building_polygon IS NULL
ORDER BY name;
