-- Add opening_hours + next_event_title + next_event_starts_at to zones_near()
-- Must DROP first because the return type is changing.
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
  next_event_starts_at timestamptz
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
    e.starts_at
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
