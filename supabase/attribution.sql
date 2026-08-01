-- Signup attribution: which venue brought a user to HereNow (Neighborhood Pilot).
-- Apple/Google don't expose install attribution, so we ask once at first launch
-- and store the answer here. Run once in Supabase. Idempotent.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_zone_id   uuid REFERENCES zones(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attribution_done boolean NOT NULL DEFAULT false;

-- Extend venue performance with attributed signups (users who named this venue as
-- the one that brought them in). Supersedes the version in admin_analytics.sql.
CREATE OR REPLACE FUNCTION admin_venue_performance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result FROM (
    SELECT
      z.id   AS zone_id,
      z.name AS name,
      (SELECT count(*)                  FROM sessions s WHERE s.zone_id = z.id) AS checkins,
      (SELECT count(DISTINCT s.user_id) FROM sessions s WHERE s.zone_id = z.id) AS unique_visitors,
      (SELECT count(*) FROM (SELECT user_id FROM sessions s WHERE s.zone_id = z.id GROUP BY user_id HAVING count(*) >= 2) rr) AS returning_visitors,
      (SELECT count(*)                  FROM qr_scans q       WHERE q.zone_id = z.id) AS scans,
      (SELECT count(*)                  FROM profiles p       WHERE p.signup_zone_id = z.id) AS attributed_signups,
      (SELECT count(*)                  FROM venue_subscriptions v WHERE v.zone_id = z.id) AS subscriptions
    FROM zones z
    WHERE z.is_active = true
    ORDER BY (SELECT count(*) FROM sessions s WHERE s.zone_id = z.id) DESC
  ) t;

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_venue_performance() TO authenticated;
