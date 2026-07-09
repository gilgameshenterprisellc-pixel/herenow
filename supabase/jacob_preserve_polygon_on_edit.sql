-- Preserve the building polygon on zone edits (July 2026). Run once in Supabase.
--
-- Bug: admin_setup_zone (admin "Edit Zone" + admin_approve_venue) and
-- auto_approve_venue both set:
--     building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ... ELSE NULL END
-- on the UPDATE path. The admin edit form always starts with an empty polygon
-- field, so editing a zone's name/radius/coords silently WIPED a hand-drawn or
-- OSM polygon, dropping check-in back to the radius circle. That is how Martha My
-- Dear ended up with no polygon and an 80m circle that reached the street.
--
-- Fix: on UPDATE, only overwrite the polygon when a NEW one is explicitly passed;
-- otherwise keep the existing one. INSERT (brand-new zone) is unchanged — a null
-- polygon there is correct, the venue simply hasn't drawn one yet.
--
-- These re-create the CURRENT live definitions (admin_setup_zone from
-- polygon_geofencing.sql, auto_approve_venue from fix_default_radius.sql with its
-- radius DEFAULT 10) with only the UPDATE polygon lines changed.

-- ── admin_setup_zone (also used by admin_approve_venue) ───────────────────────
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
      -- Keep the existing polygon unless a new one is explicitly provided.
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE building_polygon END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE polygon_source END
    WHERE id = v_existing_zone_id
    RETURNING id INTO v_zone_id;
  ELSE
    INSERT INTO zones (
      owner_id, name, type,
      center, center_lat, center_lng, radius_meters, is_active,
      building_polygon, polygon_source
    )
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

-- ── auto_approve_venue (signup + future Stripe webhook; radius DEFAULT 10) ─────
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
      -- Keep the existing polygon unless a new one is explicitly provided.
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE building_polygon END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE polygon_source END
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
