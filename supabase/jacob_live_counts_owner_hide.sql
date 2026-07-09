-- Jacob beta feedback 5: live counts + hide the venue owner. Run once in Supabase.
--
-- (#13) The map preview card showed 0 checked in and 0 posts because member_count
--       is kept by a fragile trigger (and the zone page even resets is_present on
--       mount). Fix: derive both counts live from the real source of truth
--       (active sessions, live pulse posts) inside zones_near. No triggers to trust.
-- (#1/#7) The venue owner shouldn't appear in the People list or be We-Met-able.
--       active_sessions_in_zone now excludes the zone's owner.

-- ── zones_near: live member_count + post_count ────────────────────────────────
DROP FUNCTION IF EXISTS zones_near(double precision, double precision, double precision);

CREATE FUNCTION zones_near(lat float, lng float, radius_km float DEFAULT 50)
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
    -- live "here now": active sessions in the zone
    COALESCE((SELECT count(*)::int FROM sessions s
              WHERE s.zone_id = z.id AND s.is_active = true), 0) AS member_count,
    -- live post count: non-expired, non-hidden pulse posts
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

-- ── active_sessions_in_zone: exclude the venue owner ──────────────────────────
CREATE OR REPLACE FUNCTION active_sessions_in_zone(zone_uuid uuid)
RETURNS TABLE (
  session_id       uuid,
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  social_mode      text,
  mood_mode        text,
  interest_tags    text[],
  kickoffs         text[],
  checked_in_at    timestamptz,
  privacy_settings jsonb
) AS $$
  SELECT
    s.id, s.user_id, p.display_name, p.avatar_url, s.social_mode, s.mood_mode,
    p.interest_tags, p.kickoffs, s.checked_in_at,
    COALESCE(p.privacy_settings,
      '{"show_social_mode":true,"show_mood":true,"show_interests":true,"show_kickoff":true}'::jsonb)
  FROM sessions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.zone_id = zone_uuid
    AND s.is_active = true
    AND (p.hidden_until IS NULL OR p.hidden_until < now())
    -- Hide the venue owner from their own room (auto-present, not a person card)
    AND s.user_id <> COALESCE(
      (SELECT owner_id FROM zones WHERE id = zone_uuid),
      '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;
