-- Admin analytics for the Neighborhood Pilot dashboard (Jacob's spec, Jul 2026).
-- Run once in Supabase. Idempotent.
--
-- These are SECURITY DEFINER + admin-gated because the dashboard has to aggregate
-- across ALL users, which RLS deliberately blocks for normal reads. Every
-- function checks profiles.is_admin and raises if the caller is not an admin.
--
-- Sources of truth: check-ins = the sessions table (not app_events, which only
-- has a subset). Accounts = profiles. Scans = qr_scans. Subscriptions =
-- venue_subscriptions. App Store visits + installs are intentionally absent —
-- Apple/Google don't expose them, and Jacob's doc says not to fake them.

-- ── Pilot overview: the headline "health dashboard" + funnel inputs ───────────
CREATE OR REPLACE FUNCTION admin_pilot_overview()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT jsonb_build_object(
    'total_scans',        (SELECT count(*) FROM qr_scans),
    'scans_7d',           (SELECT count(*) FROM qr_scans WHERE scanned_at > now() - interval '7 days'),
    'total_accounts',     (SELECT count(*) FROM profiles),
    'accounts_7d',        (SELECT count(*) FROM profiles WHERE created_at > now() - interval '7 days'),
    'profiles_completed', (SELECT count(*) FROM profiles WHERE avatar_url IS NOT NULL OR (bio IS NOT NULL AND length(btrim(bio)) > 0)),
    'total_checkins',     (SELECT count(*) FROM sessions),
    'checkins_7d',        (SELECT count(*) FROM sessions WHERE checked_in_at > now() - interval '7 days'),
    'checked_in_users',   (SELECT count(DISTINCT user_id) FROM sessions),
    'repeat_users',       (SELECT count(*) FROM (SELECT user_id FROM sessions GROUP BY user_id HAVING count(*) >= 2) r),
    'multi_venue_users',  (SELECT count(*) FROM (SELECT user_id FROM sessions GROUP BY user_id HAVING count(DISTINCT zone_id) >= 2) m),
    'wau',                (SELECT count(DISTINCT user_id) FROM sessions WHERE checked_in_at > now() - interval '7 days'),
    'mau',                (SELECT count(DISTINCT user_id) FROM sessions WHERE checked_in_at > now() - interval '30 days'),
    'total_subscriptions',(SELECT count(*) FROM venue_subscriptions),
    'total_venues',       (SELECT count(*) FROM zones WHERE is_active = true)
  ) INTO result;

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_pilot_overview() TO authenticated;

-- ── Per-venue performance: compare venues against each other ──────────────────
CREATE OR REPLACE FUNCTION admin_venue_performance()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result FROM (
    SELECT
      z.id   AS zone_id,
      z.name AS name,
      (SELECT count(*)             FROM sessions s WHERE s.zone_id = z.id) AS checkins,
      (SELECT count(DISTINCT s.user_id) FROM sessions s WHERE s.zone_id = z.id) AS unique_visitors,
      (SELECT count(*) FROM (SELECT user_id FROM sessions s WHERE s.zone_id = z.id GROUP BY user_id HAVING count(*) >= 2) rr) AS returning_visitors,
      (SELECT count(*)             FROM qr_scans q WHERE q.zone_id = z.id) AS scans,
      (SELECT count(*)             FROM venue_subscriptions v WHERE v.zone_id = z.id) AS subscriptions
    FROM zones z
    WHERE z.is_active = true
    ORDER BY (SELECT count(*) FROM sessions s WHERE s.zone_id = z.id) DESC
  ) t;

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_venue_performance() TO authenticated;

-- ── Per-placement QR conversion: which physical material actually works ───────
CREATE OR REPLACE FUNCTION admin_qr_placement_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result FROM (
    SELECT
      qc.placement AS placement,
      count(qs.id) AS scans
    FROM qr_codes qc
    LEFT JOIN qr_scans qs ON qs.qr_code_id = qc.id
    GROUP BY qc.placement
    ORDER BY count(qs.id) DESC
  ) t;

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_qr_placement_stats() TO authenticated;
