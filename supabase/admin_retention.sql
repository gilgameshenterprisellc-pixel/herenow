-- Retention + activation depth for the Pilot Dashboard (Jacob's spec). Run once.
-- Idempotent. Admin-gated SECURITY DEFINER, same pattern as admin_analytics.sql.
--
-- "Rolling" retention: of users whose account is at least N days old, the share
-- who checked in on or after their Nth day. More forgiving than exact-day cohort
-- retention, which is the right call for a small pilot (exact-day would read as
-- mostly zeros). Documented here so the number is never misread.

CREATE OR REPLACE FUNCTION admin_rolling_retention(p_days int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cohort int; retained int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT count(*) INTO cohort
  FROM profiles
  WHERE created_at <= now() - (p_days || ' days')::interval;

  IF cohort = 0 THEN RETURN 0; END IF;

  SELECT count(*) INTO retained
  FROM profiles p
  WHERE p.created_at <= now() - (p_days || ' days')::interval
    AND EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.user_id = p.id
        AND s.checked_in_at >= p.created_at + (p_days || ' days')::interval
    );

  RETURN round(100.0 * retained / cohort);
END $$;
GRANT EXECUTE ON FUNCTION admin_rolling_retention(int) TO authenticated;

CREATE OR REPLACE FUNCTION admin_retention()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT jsonb_build_object(
    'd1',  admin_rolling_retention(1),
    'd7',  admin_rolling_retention(7),
    'd30', admin_rolling_retention(30),
    'avg_checkins_per_user', (
      SELECT CASE WHEN count(DISTINCT user_id) > 0
        THEN round(count(*)::numeric / count(DISTINCT user_id), 1) ELSE 0 END
      FROM sessions),
    'avg_venues_per_user', (
      SELECT CASE WHEN count(DISTINCT user_id) > 0
        THEN round(count(*)::numeric / count(DISTINCT user_id), 1) ELSE 0 END
      FROM (SELECT DISTINCT user_id, zone_id FROM sessions) uv),
    'avg_session_minutes', (
      SELECT COALESCE(round(avg(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at)) / 60)), 0)
      FROM sessions
      WHERE checked_out_at IS NOT NULL AND checked_out_at > checked_in_at)
  ) INTO result;

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_retention() TO authenticated;
