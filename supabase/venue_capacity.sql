-- Venue capacity, and a busy meter that means something (Aug 2026).
--
-- Jacob: "Have venues identify their capacity at registration — busy meter will
-- work off this number. Capacity is 200, 30 people checked in, this would
-- classify the venue as busy based on percentage of members checked in, not
-- necessarily the total amount of people at the venue."
--
-- Before this, two different things claimed to measure the same fact:
--   • the venue header's HeatBar divided by a hardcoded capacity of 50
--   • the map pin lit purple at a flat 3 concurrent check-ins
-- So a room could read "Quiet" in its own header while its pin said Active.
-- lib/venueStatus.ts is now the single definition and both read from it.

-- ── 1. The column ────────────────────────────────────────────────────────────
-- NULL means "not stated" rather than zero, so the bands fall back to
-- DEFAULT_CAPACITY instead of dividing by nothing.
ALTER TABLE zones ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT NULL;

COMMENT ON COLUMN zones.capacity IS
  'Stated venue capacity. Drives the busy meter as a percentage. NULL = not stated.';

-- ── 2. zones_near must return it ─────────────────────────────────────────────
-- The map computes the pin ring from the same bands as the venue header, so it
-- needs capacity alongside member_count. Return type changes, so this is a
-- DROP + CREATE rather than CREATE OR REPLACE.
--
-- Carries forward the is_demo staleness exemption from zones_near_demo_presence.sql:
-- seeded review sessions have no client refreshing last_seen_at, so without it
-- the demo venue reads "0 here now" on the map fifteen minutes after seeding.
DROP FUNCTION IF EXISTS zones_near(double precision, double precision, double precision);

CREATE FUNCTION zones_near(lat float, lng float, radius_km float DEFAULT 50)
RETURNS TABLE (
  id uuid, name text, description text, radius_meters int, distance_meters float,
  member_count int, post_count int, center_lat float, center_lng float, chips text[],
  opening_hours text, next_event_title text, next_event_starts_at timestamptz,
  polygon_wkt text, is_temporarily_closed boolean, temporary_closure_message text,
  avatar_url text, banner_url text, category text, wait_time_minutes int,
  wait_time_updated_at timestamptz, capacity int
) AS $$
  SELECT
    z.id, z.name, z.description, z.radius_meters,
    st_distance(z.center::geography, st_point(lng, lat)::geography) AS distance_meters,
    COALESCE((SELECT count(*)::int FROM sessions s
              WHERE s.zone_id = z.id AND s.is_active = true
                AND (
                  s.last_seen_at > now() - INTERVAL '15 minutes'
                  OR EXISTS (SELECT 1 FROM profiles dp
                             WHERE dp.id = s.user_id AND dp.is_demo)
                )), 0) AS member_count,
    COALESCE((SELECT count(*)::int FROM pulse_posts p
              WHERE p.zone_id = z.id AND p.expires_at > now()
                AND COALESCE(p.is_hidden, false) = false), 0) AS post_count,
    z.center_lat, z.center_lng,
    COALESCE(z.chips, '{}'), z.opening_hours, e.title, e.starts_at, z.polygon_wkt,
    COALESCE(z.is_temporarily_closed, false), z.temporary_closure_message,
    z.avatar_url, z.banner_url, z.category, z.wait_time_minutes, z.wait_time_updated_at,
    z.capacity
  FROM zones z
  LEFT JOIN LATERAL (
    SELECT title, starts_at FROM venue_events
    WHERE zone_id = z.id AND starts_at > now() ORDER BY starts_at ASC LIMIT 1
  ) e ON true
  WHERE z.is_active = true
    AND st_dwithin(z.center::geography, st_point(lng, lat)::geography, radius_km * 1000)
  ORDER BY distance_meters ASC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 3. The demo venue ────────────────────────────────────────────────────────
-- An intimate listening room. With four people checked in that is 16%, which
-- lands in Jacob's "Busy" band — so the pin stays purple and the header agrees
-- with it. Left larger, the same four people would read "Lively" and the map
-- would go green, changing a screenshot that has already been approved.
UPDATE zones SET capacity = 25
WHERE id = '0a5f2b4f-6587-4efd-9f77-14fca9197ce2';
