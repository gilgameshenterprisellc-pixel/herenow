-- Multiple social modes (Jacob, July 16 2026): "people wanted to choose
-- multiple social modes — like, they wanted to be there for dating, but also
-- friends." Run once in the Supabase SQL editor.
--
-- Design: sessions.social_modes (text[]) carries every mode the user picked.
-- The existing sessions.social_mode column stays and holds the FIRST pick
-- (the "primary"), so every existing aggregate — venue recap RPCs, dashboard
-- history, analytics — keeps working unchanged.

-- 1. Array column + backfill existing sessions to a one-element array.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS social_modes text[] DEFAULT NULL;

UPDATE sessions
SET social_modes = ARRAY[social_mode]
WHERE social_modes IS NULL AND social_mode IS NOT NULL;

-- Only valid modes allowed in the array (mirrors the CHECK on social_mode).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_social_modes_valid'
  ) THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_social_modes_valid
      CHECK (
        social_modes IS NULL
        OR social_modes <@ ARRAY['dating','friends','networking','just_vibes']::text[]
      );
  END IF;
END $$;

-- 2. active_sessions_in_zone returns the array. Built on the latest live
--    definition (jacob_session_staleness.sql): staleness-gated, owner-hidden,
--    report-hidden. Return type changes, so DROP first.
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
    AND s.user_id <> COALESCE(
      (SELECT owner_id FROM zones WHERE id = zone_uuid),
      '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;
