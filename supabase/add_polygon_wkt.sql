-- Add polygon_wkt text column so the JS client can fetch the polygon
-- for map rendering without PostGIS binary decoding.
-- The geography column (building_polygon) is still the source of truth for
-- check-in gating via user_in_zone() / ST_Contains.

ALTER TABLE zones ADD COLUMN IF NOT EXISTS polygon_wkt TEXT DEFAULT NULL;

-- Backfill from any polygon that was already saved
UPDATE zones
SET polygon_wkt = ST_AsText(building_polygon)
WHERE building_polygon IS NOT NULL AND polygon_wkt IS NULL;

-- Update admin_save_polygon to also write polygon_wkt
CREATE OR REPLACE FUNCTION admin_save_polygon(
  p_zone_id  uuid,
  p_wkt      text,
  p_source   text DEFAULT 'manual'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE zones
  SET
    building_polygon = ST_GeogFromText(p_wkt),
    polygon_source   = p_source,
    polygon_wkt      = p_wkt
  WHERE id = p_zone_id;

  RETURN FOUND;
END;
$$;

-- Rebuild zones_near to include polygon_wkt
DROP FUNCTION IF EXISTS zones_near(double precision, double precision, double precision);

CREATE FUNCTION zones_near(lat float, lng float, radius_km float DEFAULT 50)
RETURNS TABLE (
  id                   uuid,
  name                 text,
  description          text,
  radius_meters        int,
  distance_meters      float,
  member_count         int,
  post_count           int,
  center_lat           float,
  center_lng           float,
  chips                text[],
  opening_hours        text,
  next_event_title     text,
  next_event_starts_at timestamptz,
  polygon_wkt          text
) AS $$
  SELECT
    z.id,
    z.name,
    z.description,
    z.radius_meters,
    st_distance(z.center::geography, st_point(lng, lat)::geography) AS distance_meters,
    z.member_count,
    z.post_count,
    z.center_lat,
    z.center_lng,
    COALESCE(z.chips, '{}'),
    z.opening_hours,
    e.title,
    e.starts_at,
    z.polygon_wkt
  FROM zones z
  LEFT JOIN LATERAL (
    SELECT title, starts_at
    FROM venue_events
    WHERE zone_id = z.id
      AND starts_at > now()
    ORDER BY starts_at ASC
    LIMIT 1
  ) e ON true
  WHERE
    z.is_active = true
    AND st_dwithin(
      z.center::geography,
      st_point(lng, lat)::geography,
      radius_km * 1000
    )
  ORDER BY distance_meters ASC;
$$ LANGUAGE sql SECURITY DEFINER;
