-- Presence hygiene: server-side reconcile + shorter staleness window (Aug 2026).
-- Run once in Supabase. Pairs with the presence-gated heartbeat in
-- contexts/SessionContext.tsx (the client now refreshes last_seen_at ONLY when a
-- fresh fix confirms you're still here, and stops the moment you leave).
--
-- Why this exists:
--   • Ghost check-ins ("Olivia is here but she left"): a client that vanished
--     without a clean checkout left an is_active session that the passive RPC
--     filter merely HID. Nothing actually closed it, so afterglow/history and the
--     trigger-kept zones.member_count stayed wrong. reconcile_stale_sessions()
--     closes those rows and repairs the presence flags.
--   • Window: 30 min was long for small rooms where an empty venue is obvious. We
--     tighten to 15. Tradeoff — a present user whose app is fully suspended (phone
--     locked, no background permission) and who never re-opens it within 15 min
--     will be dropped and can re-check-in with one tap. If beta users report
--     being dropped while still out, bump 15 -> 20/30 in the three spots below.

-- is_demo: the App Store review account + any seeded demo companions. Their
-- sessions are exempt from staleness so the demo venue's room never empties out
-- mid-review. Defaults false, so real users are unaffected. Created here (IF NOT
-- EXISTS) so this file is self-sufficient regardless of run order vs
-- apple_demo_account.sql.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- ── 1. Reconcile function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reconcile_stale_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  closed integer;
BEGIN
  -- Close active sessions whose heartbeat went stale (left + app went quiet).
  -- Demo accounts are exempt (seeded sessions must persist through App Review).
  UPDATE sessions
     SET is_active = false,
         checked_out_at = COALESCE(checked_out_at, now())
   WHERE is_active = true
     AND last_seen_at < now() - INTERVAL '15 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM profiles p WHERE p.id = sessions.user_id AND p.is_demo = true
     );
  GET DIAGNOSTICS closed = ROW_COUNT;

  -- Repair presence flags: anyone still marked present in zone_members but with
  -- no active session there has left. This is what keeps zones.member_count (kept
  -- by the is_present trigger) from drifting upward forever.
  UPDATE zone_members zm
     SET is_present = false,
         last_seen_at = now()
   WHERE zm.is_present = true
     AND NOT EXISTS (
       SELECT 1 FROM sessions s
       WHERE s.user_id = zm.user_id
         AND s.zone_id = zm.zone_id
         AND s.is_active = true
     );

  RETURN closed;
END;
$$;

-- ── 2. Schedule it (optional but recommended) ─────────────────────────────────
-- The passive RPC filter below already HIDES stale rows from the live count, so
-- the room reads correctly even without this. The schedule is what actually
-- CLOSES the rows so history/analytics are right. If pg_cron is enabled on this
-- project (Supabase: Database → Extensions → pg_cron), run:
--
--   select cron.schedule('herenow-reconcile-stale', '*/5 * * * *',
--                        'select reconcile_stale_sessions();');
--
-- If pg_cron is not available, call reconcile_stale_sessions() from any external
-- scheduler (Vercel cron, GitHub Actions, an Inngest tick, etc.).

-- ── 3. active_sessions_in_zone — 15-min window (was 30) ───────────────────────
-- Verbatim from jacob_ghost_toggle.sql (ghosts hidden, owner hidden) with only
-- the staleness interval changed. Ghost visibility is a separate change.
DROP FUNCTION IF EXISTS active_sessions_in_zone(uuid);

CREATE FUNCTION active_sessions_in_zone(zone_uuid uuid)
RETURNS TABLE (
  session_id uuid, user_id uuid, display_name text, avatar_url text,
  social_mode text, social_modes text[], mood_mode text,
  interest_tags text[], kickoffs text[],
  checked_in_at timestamptz, privacy_settings jsonb
) AS $$
  SELECT
    s.id, s.user_id, p.display_name, p.avatar_url,
    s.social_mode,
    COALESCE(s.social_modes, ARRAY[s.social_mode]),
    s.mood_mode,
    p.interest_tags, p.kickoffs, s.checked_in_at,
    COALESCE(p.privacy_settings,
      '{"show_social_mode":true,"show_mood":true,"show_interests":true,"show_kickoff":true}'::jsonb)
  FROM sessions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.zone_id = zone_uuid
    AND s.is_active = true
    -- Fresh heartbeat, OR a demo account (seeded demo people never age out).
    AND (s.last_seen_at > now() - INTERVAL '15 minutes' OR COALESCE(p.is_demo, false))
    AND (p.hidden_until IS NULL OR p.hidden_until < now())
    AND NOT COALESCE(s.is_ghost, false)
    AND s.user_id <> COALESCE(
      (SELECT owner_id FROM zones WHERE id = zone_uuid),
      '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 4. zones_near — 15-min window on the live member_count (was 30) ───────────
-- Verbatim from jacob_session_staleness.sql with only the staleness interval
-- changed, so the map card's "here now" matches the zone page's room count.
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
    COALESCE((SELECT count(*)::int FROM sessions s
              WHERE s.zone_id = z.id AND s.is_active = true
                AND s.last_seen_at > now() - INTERVAL '15 minutes'), 0) AS member_count,
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

-- One-time sweep so existing ghosts clear immediately (don't wait for the cron).
SELECT reconcile_stale_sessions();
