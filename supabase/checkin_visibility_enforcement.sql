-- checkin_visibility has never done anything.
--
-- app/profile/edit.tsx has shipped a switch that reads and writes
-- profiles.checkin_visibility and tells the user, verbatim:
--
--     "Others only see your name — no interests, age, or kickoff"
--
-- Nothing has ever read that column. active_sessions_in_zone returns
-- interest_tags and kickoffs unconditionally, and PersonCard filters on
-- privacy_settings, a different and later setting. So the switch saves, the UI
-- reflects it, and every interest and kickoff stays visible to the whole room.
--
-- Enforced here rather than in the client on purpose: the point of a privacy
-- control is that the data does not leave the server. Filtering it in
-- PersonCard would still ship it to every device in the venue.
--
-- Verbatim from session_reconcile_and_window.sql (the current definition:
-- 15-min staleness window, demo accounts exempt, ghosts hidden, venue owner
-- hidden) with only the visibility handling added. Do not drop the other
-- predicates when next redefining this.

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
    -- Minimal check-in privacy: interests and kickoffs never leave the server.
    -- Anything other than 'minimal' (including NULL) is treated as full, which
    -- keeps existing rows behaving exactly as they do today.
    CASE WHEN p.checkin_visibility = 'minimal' THEN ARRAY[]::text[] ELSE p.interest_tags END,
    CASE WHEN p.checkin_visibility = 'minimal' THEN ARRAY[]::text[] ELSE p.kickoffs     END,
    s.checked_in_at,
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
