-- Wait-time + venue category (Alex's idea + Jacob Q15). Run once in Supabase SQL editor.

-- 1. New columns on zones
ALTER TABLE zones ADD COLUMN IF NOT EXISTS category             TEXT        DEFAULT NULL;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS wait_time_minutes    INT         DEFAULT NULL;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS wait_time_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 2. zones_near() — add category + wait_time so the Nearby cards can show them.
--    (Also adds avatar_url/banner_url, which the Zone type already expects but the
--    old RPC never returned — harmless to include now.)
DROP FUNCTION IF EXISTS zones_near(double precision, double precision, double precision);

CREATE FUNCTION zones_near(lat float, lng float, radius_km float DEFAULT 50)
RETURNS TABLE (
  id                        uuid,
  name                      text,
  description               text,
  radius_meters             int,
  distance_meters           float,
  member_count              int,
  post_count                int,
  center_lat                float,
  center_lng                float,
  chips                     text[],
  opening_hours             text,
  next_event_title          text,
  next_event_starts_at      timestamptz,
  polygon_wkt               text,
  is_temporarily_closed     boolean,
  temporary_closure_message text,
  avatar_url                text,
  banner_url                text,
  category                  text,
  wait_time_minutes         int,
  wait_time_updated_at      timestamptz
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
    z.polygon_wkt,
    COALESCE(z.is_temporarily_closed, false),
    z.temporary_closure_message,
    z.avatar_url,
    z.banner_url,
    z.category,
    z.wait_time_minutes,
    z.wait_time_updated_at
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
