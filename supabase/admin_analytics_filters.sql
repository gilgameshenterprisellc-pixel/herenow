-- Date-range filter for the Pilot Dashboard (Jacob's spec). Adds an optional
-- p_days window to the overview / venue-performance / placement RPCs.
--   p_days NULL  -> all time
--   p_days 7/30/90 -> that many days back
-- Supersedes the versions in admin_analytics.sql + attribution.sql. Idempotent.
-- Run once in Supabase.

-- Drop the old zero-arg versions so the new defaulted signatures aren't ambiguous.
DROP FUNCTION IF EXISTS admin_pilot_overview();
DROP FUNCTION IF EXISTS admin_venue_performance();
DROP FUNCTION IF EXISTS admin_qr_placement_stats();

CREATE OR REPLACE FUNCTION admin_pilot_overview(p_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  since := CASE WHEN p_days IS NULL THEN NULL ELSE now() - make_interval(days => p_days) END;

  SELECT jsonb_build_object(
    'total_scans',        (SELECT count(*) FROM qr_scans WHERE since IS NULL OR scanned_at >= since),
    'scans_7d',           (SELECT count(*) FROM qr_scans WHERE scanned_at > now() - interval '7 days'),
    'total_accounts',     (SELECT count(*) FROM profiles WHERE since IS NULL OR created_at >= since),
    'accounts_7d',        (SELECT count(*) FROM profiles WHERE created_at > now() - interval '7 days'),
    'profiles_completed', (SELECT count(*) FROM profiles WHERE (since IS NULL OR created_at >= since) AND (avatar_url IS NOT NULL OR (bio IS NOT NULL AND length(btrim(bio)) > 0))),
    'total_checkins',     (SELECT count(*) FROM sessions WHERE since IS NULL OR checked_in_at >= since),
    'checkins_7d',        (SELECT count(*) FROM sessions WHERE checked_in_at > now() - interval '7 days'),
    'checked_in_users',   (SELECT count(DISTINCT user_id) FROM sessions WHERE since IS NULL OR checked_in_at >= since),
    'repeat_users',       (SELECT count(*) FROM (SELECT user_id FROM sessions WHERE since IS NULL OR checked_in_at >= since GROUP BY user_id HAVING count(*) >= 2) r),
    'multi_venue_users',  (SELECT count(*) FROM (SELECT user_id FROM sessions WHERE since IS NULL OR checked_in_at >= since GROUP BY user_id HAVING count(DISTINCT zone_id) >= 2) m),
    'wau',                (SELECT count(DISTINCT user_id) FROM sessions WHERE checked_in_at > now() - interval '7 days'),
    'mau',                (SELECT count(DISTINCT user_id) FROM sessions WHERE checked_in_at > now() - interval '30 days'),
    'total_subscriptions',(SELECT count(*) FROM venue_subscriptions WHERE since IS NULL OR subscribed_at >= since),
    'total_venues',       (SELECT count(*) FROM zones WHERE is_active = true)
  ) INTO result;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_pilot_overview(int) TO authenticated;

CREATE OR REPLACE FUNCTION admin_venue_performance(p_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  since := CASE WHEN p_days IS NULL THEN NULL ELSE now() - make_interval(days => p_days) END;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result FROM (
    SELECT
      z.id AS zone_id, z.name AS name,
      (SELECT count(*)                  FROM sessions s WHERE s.zone_id = z.id AND (since IS NULL OR s.checked_in_at >= since)) AS checkins,
      (SELECT count(DISTINCT s.user_id) FROM sessions s WHERE s.zone_id = z.id AND (since IS NULL OR s.checked_in_at >= since)) AS unique_visitors,
      (SELECT count(*) FROM (SELECT user_id FROM sessions s WHERE s.zone_id = z.id AND (since IS NULL OR s.checked_in_at >= since) GROUP BY user_id HAVING count(*) >= 2) rr) AS returning_visitors,
      (SELECT count(*)                  FROM qr_scans q WHERE q.zone_id = z.id AND (since IS NULL OR q.scanned_at >= since)) AS scans,
      (SELECT count(*)                  FROM profiles p WHERE p.signup_zone_id = z.id AND (since IS NULL OR p.created_at >= since)) AS attributed_signups,
      (SELECT count(*)                  FROM venue_subscriptions v WHERE v.zone_id = z.id AND (since IS NULL OR v.subscribed_at >= since)) AS subscriptions
    FROM zones z
    WHERE z.is_active = true
    ORDER BY (SELECT count(*) FROM sessions s WHERE s.zone_id = z.id AND (since IS NULL OR s.checked_in_at >= since)) DESC
  ) t;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_venue_performance(int) TO authenticated;

CREATE OR REPLACE FUNCTION admin_qr_placement_stats(p_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  since := CASE WHEN p_days IS NULL THEN NULL ELSE now() - make_interval(days => p_days) END;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result FROM (
    SELECT qc.placement AS placement,
      count(qs.id) FILTER (WHERE since IS NULL OR qs.scanned_at >= since) AS scans
    FROM qr_codes qc
    LEFT JOIN qr_scans qs ON qs.qr_code_id = qc.id
    GROUP BY qc.placement
    ORDER BY count(qs.id) FILTER (WHERE since IS NULL OR qs.scanned_at >= since) DESC
  ) t;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_qr_placement_stats(int) TO authenticated;
