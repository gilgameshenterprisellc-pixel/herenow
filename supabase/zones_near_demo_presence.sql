-- zones_near: exempt demo sessions from the 15-minute staleness window.
--
-- The map preview card's "here now" is NOT zones.member_count. That stored
-- column is vestigial for this purpose. The live function counts active sessions
-- whose last_seen_at falls inside a 15-minute window (session_reconcile_and_window.sql),
-- which is correct for real users: a session nobody has touched in 15 minutes is
-- a ghost, and showing it makes an empty venue look busy.
--
-- It is wrong for the App Store review account. The demo companions are seeded
-- rows, nothing is running a client to refresh their last_seen_at, so they fall
-- out of the window within 15 minutes of being seeded and stay out forever. The
-- reviewer opens the map, sees "0 here now" on the one venue they were told to
-- visit, and the app looks dead before they ever tap it.
--
-- Every other staleness path already exempts is_demo — reconcile_stale_sessions()
-- does, which is what keeps the seeded room populated on the venue page. This is
-- the one place the exemption was missed, which is exactly why the venue page
-- said "4 here now" while the map said 0 for the same venue at the same moment.
--
-- Real users are unaffected: the window still applies to every session whose
-- owner is not is_demo, and is_demo cannot be self-granted (prevent_self_badge).
--
-- CREATE OR REPLACE, not DROP + CREATE: the signature and return type are
-- unchanged, so there is no window where the function does not exist.

CREATE OR REPLACE FUNCTION zones_near(lat float, lng float, radius_km float DEFAULT 50)
RETURNS TABLE (
  id uuid, name text, description text, radius_meters int, distance_meters float,
  member_count int, post_count int, center_lat float, center_lng float, chips text[],
  opening_hours text, next_event_title text, next_event_starts_at timestamptz,
  polygon_wkt text, is_temporarily_closed boolean, temporary_closure_message text,
  avatar_url text, banner_url text, category text, wait_time_minutes int, wait_time_updated_at timestamptz
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
    z.avatar_url, z.banner_url, z.category, z.wait_time_minutes, z.wait_time_updated_at
  FROM zones z
  LEFT JOIN LATERAL (
    SELECT title, starts_at FROM venue_events
    WHERE zone_id = z.id AND starts_at > now() ORDER BY starts_at ASC LIMIT 1
  ) e ON true
  WHERE z.is_active = true
    AND st_dwithin(z.center::geography, st_point(lng, lat)::geography, radius_km * 1000)
  ORDER BY distance_meters ASC;
$$ LANGUAGE sql SECURITY DEFINER;
