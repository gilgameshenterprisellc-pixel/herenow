-- Venue building-polygon — SINGLE SOURCE OF TRUTH (Aug 2026).
-- Run once in Supabase. Supersedes the auto_approve_venue in mapbox_precision.sql
-- and consolidates all three polygon writers so the logic can't drift again.
--
-- INTENDED BEHAVIOUR (what the footprint should do):
--   • OSM fetch and Manual draw (both admin-panel buttons) call
--     admin_save_polygon, which ALWAYS overwrites the footprint and stamps the
--     source ('osm' | 'manual'). Whichever you do last wins — OSM overwrites a
--     manual draw and a manual draw overwrites OSM, by design.
--   • Signup / approval (auto_approve_venue) and admin Edit Zone (admin_setup_zone):
--     a polygon passed in is written; a NULL polygon means "leave the footprint
--     alone", so editing a venue's name / radius / coords never WIPES a hand-drawn
--     or OSM footprint (the bug that gave Martha My Dear a bare 80m circle).
--   • Every write is validated + normalized to a MULTIPOLYGON by the
--     zones_repair_building_polygon trigger (see geofence_hardening.sql).
--   • radius_meters default is 10m. The footprint is the real geofence; the circle
--     is only a fallback for venues with no polygon yet — never 75m, which reached
--     the street.

-- 0. Drop the stale 6-arg auto_approve_venue (mapbox_precision.sql): no polygon
--    param, 75m radius. Removing it means a 6-arg call can never hit the wrong one.
DROP FUNCTION IF EXISTS auto_approve_venue(uuid, float, float, text, text, int);

-- 1. auto_approve_venue — venue signup, approval, and the future Stripe webhook.
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
      -- Overwrite only when a new polygon is provided; otherwise keep the current one.
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE building_polygon END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE polygon_source END
    WHERE id = v_existing_zone_id;
  ELSE
    INSERT INTO zones (name, type, center, center_lat, center_lng, radius_meters, owner_id, is_active, building_polygon, polygon_source)
    VALUES (
      p_name, p_type,
      ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      p_lat, p_lng, p_radius, p_profile_id, true,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE NULL END,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE NULL END
    );
  END IF;

  UPDATE profiles SET venue_status = 'approved', is_venue_owner = true WHERE id = p_profile_id;
  RETURN true;
END;
$$;

-- 2. admin_setup_zone — admin "Edit Zone" and admin_approve_venue.
CREATE OR REPLACE FUNCTION admin_setup_zone(
  p_owner_id    uuid,
  p_zone_name   text,
  p_zone_type   text,
  p_lat         float,
  p_lng         float,
  p_radius      int,
  p_polygon_wkt text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_zone_id          uuid;
  v_existing_zone_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT id INTO v_existing_zone_id FROM zones WHERE owner_id = p_owner_id LIMIT 1;

  IF v_existing_zone_id IS NOT NULL THEN
    UPDATE zones SET
      name             = p_zone_name,
      type             = p_zone_type,
      center           = ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      center_lat       = p_lat,
      center_lng       = p_lng,
      radius_meters    = p_radius,
      is_active        = true,
      -- Overwrite only when a new polygon is provided; otherwise keep the current one.
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE building_polygon END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE polygon_source END
    WHERE id = v_existing_zone_id
    RETURNING id INTO v_zone_id;
  ELSE
    INSERT INTO zones (owner_id, name, type, center, center_lat, center_lng, radius_meters, is_active, building_polygon, polygon_source)
    VALUES (
      p_owner_id, p_zone_name, p_zone_type,
      ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      p_lat, p_lng, p_radius, true,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE NULL END,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE NULL END
    )
    RETURNING id INTO v_zone_id;
  END IF;

  RETURN v_zone_id;
END;
$$;

-- 3. admin_save_polygon — the explicit OSM-fetch and Manual-draw buttons. ALWAYS
--    overwrites (that is the whole point: doing OSM or manual sets the footprint
--    and replaces whatever was there) and stamps the source.
CREATE OR REPLACE FUNCTION admin_save_polygon(
  p_zone_id uuid,
  p_wkt     text,
  p_source  text DEFAULT 'manual'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE zones
  SET building_polygon = ST_GeogFromText(p_wkt),
      polygon_source   = p_source
  WHERE id = p_zone_id;

  RETURN FOUND;
END;
$$;
