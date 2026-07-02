-- Fix default radius: 75m → 10m
-- Standard (non-polygon) venues use 10m for precise indoor check-in.
-- user_in_zone() ignores radius_meters entirely when building_polygon is set,
-- so this only affects circle-fallback venues.

-- 1. Clean up polygon-geofenced venues that still show "75m" in the UI.
--    Their check-in gating is already polygon-based, but the display was misleading.
UPDATE zones
SET radius_meters = 10
WHERE building_polygon IS NOT NULL
  AND radius_meters = 75;

-- 2. Update auto_approve_venue default from 75 → 10
CREATE OR REPLACE FUNCTION auto_approve_venue(
  p_profile_id  uuid,
  p_lat         float,
  p_lng         float,
  p_name        text,
  p_type        text,
  p_radius      int  DEFAULT 10,
  p_polygon_wkt text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing_zone_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_profile_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_existing_zone_id FROM zones WHERE owner_id = p_profile_id LIMIT 1;

  IF v_existing_zone_id IS NOT NULL THEN
    UPDATE zones SET
      name             = p_name,
      type             = p_type,
      center           = ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      center_lat       = p_lat,
      center_lng       = p_lng,
      radius_meters    = p_radius,
      is_active        = true,
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE NULL END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE NULL END
    WHERE id = v_existing_zone_id;
  ELSE
    INSERT INTO zones (
      name, type,
      center, center_lat, center_lng, radius_meters,
      owner_id, is_active,
      building_polygon, polygon_source
    )
    VALUES (
      p_name, p_type,
      ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      p_lat, p_lng, p_radius,
      p_profile_id, true,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE NULL END,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE NULL END
    );
  END IF;

  UPDATE profiles
  SET venue_status = 'approved', is_venue_owner = true
  WHERE id = p_profile_id;

  RETURN true;
END;
$$;
