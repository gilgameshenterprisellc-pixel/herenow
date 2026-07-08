-- Report auto-hide (Jacob, July 7 2026): "Must be an auto-hide. Err on the side
-- of caution." Reporting someone immediately hides them from every People tab
-- for 24 hours pending admin review. Run once in Supabase SQL editor.

-- 1. Hide flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hidden_until timestamptz DEFAULT NULL;

-- 2. Report + auto-hide in one atomic call
CREATE OR REPLACE FUNCTION report_user_auto_hide(
  p_reported_id uuid,
  p_zone_id     uuid,
  p_reason      text,
  p_note        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_reported_id = auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO safety_reports (reporter_id, reported_id, zone_id, reason, note)
  VALUES (auth.uid(), p_reported_id, p_zone_id, p_reason, p_note);

  UPDATE profiles
  SET hidden_until = now() + INTERVAL '24 hours'
  WHERE id = p_reported_id;
END $$;

-- 3. active_sessions_in_zone excludes hidden users
--    (same shape as profile_privacy.sql version + the hidden_until filter)
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
    s.id,
    s.user_id,
    p.display_name,
    p.avatar_url,
    s.social_mode,
    s.mood_mode,
    p.interest_tags,
    p.kickoffs,
    s.checked_in_at,
    COALESCE(
      p.privacy_settings,
      '{"show_social_mode":true,"show_mood":true,"show_interests":true,"show_kickoff":true}'::jsonb
    )
  FROM sessions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.zone_id = zone_uuid
    AND s.is_active = true
    AND (p.hidden_until IS NULL OR p.hidden_until < now())
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Admin: to unhide someone early after reviewing the report:
--   UPDATE profiles SET hidden_until = NULL WHERE id = '<user_id>';
-- The hide also auto-expires after 24h with no action.
