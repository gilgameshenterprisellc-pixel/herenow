-- Update zones_near() to return the chips column so ZoneCards can display venue tags
CREATE OR REPLACE FUNCTION zones_near(lat float, lng float, radius_km float default 50)
RETURNS TABLE(
  id             uuid,
  name           text,
  description    text,
  radius_meters  int,
  distance_meters float,
  member_count   int,
  post_count     int,
  center_lat     float,
  center_lng     float,
  chips          text[]
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
    COALESCE(z.chips, '{}')
  FROM zones z
  WHERE
    z.is_active = true
    AND st_dwithin(
      z.center::geography,
      st_point(lng, lat)::geography,
      radius_km * 1000
    )
  ORDER BY distance_meters ASC;
$$ LANGUAGE sql SECURITY DEFINER;
