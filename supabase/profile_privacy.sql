-- Profile privacy controls — what others see on your PersonCard
-- Run in Supabase SQL editor

-- 1. Add privacy_settings column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS privacy_settings JSONB
DEFAULT '{"show_social_mode":true,"show_mood":true,"show_interests":true,"show_kickoff":true}';

-- 2. Backfill any nulls so all existing profiles get defaults
UPDATE profiles
SET privacy_settings = '{"show_social_mode":true,"show_mood":true,"show_interests":true,"show_kickoff":true}'
WHERE privacy_settings IS NULL;

-- 3. Replace active_sessions_in_zone to include privacy_settings
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
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;
