-- Polygon Geofencing
-- Run after all existing migrations (schema.sql, admin_controls.sql, etc.)
-- This file supersedes mapbox_precision.sql — run this one instead.

-- ── 1. Schema additions ────────────────────────────────────────────────────────

ALTER TABLE zones    ADD COLUMN IF NOT EXISTS building_polygon geography(POLYGON, 4326) DEFAULT NULL;
ALTER TABLE zones    ADD COLUMN IF NOT EXISTS polygon_source   TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS venue_geocode_confidence FLOAT;

-- ── 2. user_in_zone — polygon-first, circle fallback ──────────────────────────
--
--    Called every time a user taps "Check In". If the zone has a building
--    polygon stored (fetched from OpenStreetMap at approval time), we do a
--    precise point-in-polygon check. If not, we fall back to the old circle
--    radius. Either way the client calls the same RPC with no code change.

CREATE OR REPLACE FUNCTION user_in_zone(zone_id uuid, user_lat float, user_lng float)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  z RECORD;
BEGIN
  SELECT center, radius_meters, building_polygon
  INTO z
  FROM zones
  WHERE id = zone_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF z.building_polygon IS NOT NULL THEN
    RETURN ST_Contains(
      z.building_polygon::geometry,
      ST_Point(user_lng, user_lat)::geometry
    );
  END IF;

  RETURN ST_DWithin(
    z.center::geography,
    ST_Point(user_lng, user_lat)::geography,
    z.radius_meters
  );
END;
$$;

-- ── 3. admin_setup_zone — stores polygon when provided ────────────────────────

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
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE NULL END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE NULL END
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

-- ── 4. admin_approve_venue — passes polygon through to admin_setup_zone ────────

CREATE OR REPLACE FUNCTION admin_approve_venue(
  p_profile_id  uuid,
  p_zone_name   text,
  p_zone_type   text,
  p_lat         float,
  p_lng         float,
  p_radius      int,
  p_polygon_wkt text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  PERFORM admin_setup_zone(p_profile_id, p_zone_name, p_zone_type, p_lat, p_lng, p_radius, p_polygon_wkt);

  UPDATE profiles SET venue_status = 'approved' WHERE id = p_profile_id;
END;
$$;

-- ── 5. auto_approve_venue — self-service (signup + future Stripe webhook) ──────
--
--    Called when Mapbox confidence >= 0.9 at signup. The polygon is fetched
--    by the app before calling this RPC and passed as p_polygon_wkt.
--    When Stripe is wired up, the payment webhook calls this via service role
--    (auth.uid() IS NULL) so the auth check allows that path.

CREATE OR REPLACE FUNCTION auto_approve_venue(
  p_profile_id  uuid,
  p_lat         float,
  p_lng         float,
  p_name        text,
  p_type        text,
  p_radius      int  DEFAULT 75,
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
