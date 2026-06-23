-- Ghost Mode: user stays checked in but is invisible on the People list.
-- They can still see others. Not Today = don't approach. Ghost = don't see me at all.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN DEFAULT FALSE;

-- Replace the RPC so ghost users are filtered out of every venue's People tab.
CREATE OR REPLACE FUNCTION active_sessions_in_zone(zone_uuid uuid)
RETURNS TABLE (
  session_id    uuid,
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  social_mode   text,
  mood_mode     text,
  interest_tags text[],
  kickoffs      text[],
  checked_in_at timestamptz
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
    s.checked_in_at
  FROM sessions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.zone_id = zone_uuid
    AND s.is_active = true
    AND (p.ghost_mode IS NULL OR p.ghost_mode = false)
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;
