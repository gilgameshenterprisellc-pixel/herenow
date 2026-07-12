-- Let a venue owner see WHO their subscribers are (Jacob build 8). Run once.
--
-- Owner-gated SECURITY DEFINER so it can read subscriber profiles safely, and it
-- only returns name + avatar + subscribe date, nothing else. Names are masked to
-- first name + last initial in the app, consistent with the privacy model.

CREATE OR REPLACE FUNCTION venue_subscribers(p_zone_id uuid)
RETURNS TABLE (user_id uuid, display_name text, avatar_url text, subscribed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM zones WHERE id = p_zone_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, p.avatar_url, vs.subscribed_at
    FROM venue_subscriptions vs
    JOIN profiles p ON p.id = vs.user_id
    WHERE vs.zone_id = p_zone_id AND vs.is_subscriber = true
    ORDER BY vs.subscribed_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION venue_subscribers(uuid) TO authenticated;
