-- Ghost as its own toggle, separate from Mood (Jacob, Jul 2026)
-- ----------------------------------------------------------------------------
-- Before: Ghost WAS the "Not Today" mood. That conflated two ideas.
-- After:
--   Mood = Open / Selective / Not Today. "Not Today" now means "present in the
--   room, using the app, just not looking to meet" — VISIBLE (shown muted, no We
--   Met), not hidden.
--   Ghost = a separate toggle. Ghosted = invisible (hidden from the people list)
--   AND walled off from the room (People/Pulse/Chat/Board), venue updates only.
-- Run once in the Supabase SQL editor.

-- Per-session ghost state (the in-venue flag) + the user's default (Settings).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN DEFAULT false;

-- The people list hides ghosts at the source. Rebuilt verbatim from the current
-- definition (jacob_multi_social_modes.sql) with ONE added filter: exclude
-- ghosted sessions. "Not Today" sessions are intentionally NOT excluded anymore.
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
    AND s.last_seen_at > now() - INTERVAL '30 minutes'
    AND (p.hidden_until IS NULL OR p.hidden_until < now())
    AND NOT COALESCE(s.is_ghost, false)          -- ghosts are invisible
    AND s.user_id <> COALESCE(
      (SELECT owner_id FROM zones WHERE id = zone_uuid),
      '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Note: existing sessions/profiles with mood_mode='not_today' are NOT migrated to
-- ghost. They simply become visible "Not Today" users. Anyone who wants to be
-- invisible turns on the Ghost toggle (defaults off).
