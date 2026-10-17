-- Pilot Dashboard accuracy pass (Oct 2026). Run once in the Supabase SQL editor.
-- Idempotent. Supersedes the overview / venue-performance / retention functions in
-- admin_analytics.sql, attribution.sql, admin_analytics_filters.sql and
-- admin_retention.sql. Same signatures and the same JSON keys, so the build that
-- is already in the App Store keeps working and simply shows corrected numbers.
--
-- Jacob (Oct 17): "it's in our collective best interest that we get the best and
-- most accurate data from that so we can build a compelling case for investors."
-- What was wrong, and what each function does now:
--
-- 1. Our own accounts were counted as pilot users. Admins (the team), the App
--    Store demo account and its seeded companions, and venue-owner accounts all
--    inflated accounts, check-ins and retention. They are excluded everywhere
--    below, and so is a venue owner checking in at their own venue.
--
-- 2. A check-in was a sessions row. One night out can produce several rows: the
--    15-minute staleness sweep drops a locked phone and the person re-checks in,
--    or the geofence flaps at the door. Check-ins are now VISITS: one person, one
--    venue, one night. A night is the same one the app uses (lib/nights.ts):
--    Nashville time, and it runs until 6am, so 9pm and 1am are one night out.
--    "Returning" means came back on a different night, not reopened the app.
--
-- 3. Under a date range the funnel mixed populations: accounts created in the
--    range against anyone who checked in during the range, which could read over
--    100% and made "Never checked in" negative. Every funnel step is now the same
--    people: accounts created in the range, and what those accounts went on to do.
--
-- 4. Retention was measured from signup and against every account, including
--    people who never checked in, and each window had its own cohort, so Day 30
--    could read higher than Day 7. It is now measured from a person's first visit
--    (activation), and every number comes with its denominator. HereNow is a
--    going-out app, so the question is whether people come back on another night,
--    not whether they open it the next day.
--
-- 5. "Avg time checked in" used the time the cleanup job closed a stale session,
--    which can be hours or days after the person left. A session now ends at the
--    later of its checkout and its last heartbeat only when the two agree; when the
--    checkout came long after the last heartbeat, the last heartbeat wins.

-- ── Helpers (internal: not callable through the API) ─────────────────────────
-- Profiles that count as pilot users. One definition, used by every function.
CREATE OR REPLACE FUNCTION analytics_counted_users()
RETURNS TABLE (id uuid, created_at timestamptz, signup_zone_id uuid, has_profile boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.created_at, p.signup_zone_id,
         (p.avatar_url IS NOT NULL OR (p.bio IS NOT NULL AND length(btrim(p.bio)) > 0))
  FROM profiles p
  WHERE NOT COALESCE(p.is_admin, false)
    AND NOT COALESCE(p.is_demo, false)
    AND NOT COALESCE(p.is_venue_owner, false)
$$;

-- One row per visit: a counted user at one venue on one night. first_at is the
-- first check-in of that visit, minutes is the time actually spent there.
CREATE OR REPLACE FUNCTION analytics_visits()
RETURNS TABLE (user_id uuid, zone_id uuid, night date, first_at timestamptz, minutes numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT s.user_id, s.zone_id, s.checked_in_at,
           ((s.checked_in_at AT TIME ZONE 'America/Chicago') - interval '6 hours')::date AS night,
           -- When the session ended. A checkout more than 15 minutes after the
           -- last heartbeat was the cleanup sweep, not the person leaving.
           CASE
             WHEN s.checked_out_at IS NOT NULL
              AND (s.last_seen_at IS NULL OR s.checked_out_at <= s.last_seen_at + interval '15 minutes')
               THEN s.checked_out_at
             WHEN s.last_seen_at IS NOT NULL
              AND (s.checked_out_at IS NOT NULL OR s.last_seen_at < now() - interval '15 minutes')
               THEN s.last_seen_at
             ELSE NULL  -- still checked in right now: no duration yet
           END AS ended_at
    FROM sessions s
    JOIN analytics_counted_users() u ON u.id = s.user_id
    LEFT JOIN zones z ON z.id = s.zone_id
    WHERE s.checked_in_at IS NOT NULL
      AND s.user_id IS DISTINCT FROM z.owner_id
  )
  SELECT user_id, zone_id, night, min(checked_in_at) AS first_at,
         sum(EXTRACT(EPOCH FROM (ended_at - checked_in_at)) / 60)
           FILTER (WHERE ended_at > checked_in_at) AS minutes
  FROM s
  GROUP BY user_id, zone_id, night
$$;

REVOKE ALL ON FUNCTION analytics_counted_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_visits()        FROM PUBLIC, anon, authenticated;

-- ── Overview: headline cards + funnel ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_pilot_overview(p_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  since := CASE WHEN p_days IS NULL THEN NULL ELSE now() - make_interval(days => p_days) END;

  WITH users  AS (SELECT * FROM analytics_counted_users()),
       visits AS (SELECT * FROM analytics_visits()),
       -- The funnel's people: accounts created in the range.
       cohort AS (SELECT * FROM users WHERE since IS NULL OR created_at >= since),
       -- What each of them did, over their whole history.
       depth  AS (
         SELECT c.id,
                count(DISTINCT v.night)   AS nights,
                count(DISTINCT v.zone_id) AS venues
         FROM cohort c JOIN visits v ON v.user_id = c.id
         GROUP BY c.id
       )
  SELECT jsonb_build_object(
    'total_scans',         (SELECT count(*) FROM qr_scans WHERE since IS NULL OR scanned_at >= since),
    'scans_7d',            (SELECT count(*) FROM qr_scans WHERE scanned_at > now() - interval '7 days'),
    'total_accounts',      (SELECT count(*) FROM cohort),
    'accounts_7d',         (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days'),
    'profiles_completed',  (SELECT count(*) FROM cohort WHERE has_profile),
    'total_checkins',      (SELECT count(*) FROM visits WHERE since IS NULL OR first_at >= since),
    'checkins_7d',         (SELECT count(*) FROM visits WHERE first_at > now() - interval '7 days'),
    'checked_in_users',    (SELECT count(*) FROM depth),
    'repeat_users',        (SELECT count(*) FROM depth WHERE nights >= 2),
    'multi_venue_users',   (SELECT count(*) FROM depth WHERE venues >= 2),
    'wau',                 (SELECT count(DISTINCT user_id) FROM visits WHERE first_at > now() - interval '7 days'),
    'mau',                 (SELECT count(DISTINCT user_id) FROM visits WHERE first_at > now() - interval '30 days'),
    'total_subscriptions', (SELECT count(*) FROM venue_subscriptions vs JOIN users u ON u.id = vs.user_id
                             WHERE since IS NULL OR vs.subscribed_at >= since),
    'total_venues',        (SELECT count(*) FROM zones WHERE is_active = true),
    -- Shown on the dashboard so the exclusion is never invisible.
    'excluded_accounts',   (SELECT count(*) FROM profiles) - (SELECT count(*) FROM users)
  ) INTO result;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_pilot_overview(int) TO authenticated;

-- ── Per-venue performance ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_venue_performance(p_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  since := CASE WHEN p_days IS NULL THEN NULL ELSE now() - make_interval(days => p_days) END;

  WITH users  AS (SELECT * FROM analytics_counted_users()),
       visits AS (SELECT * FROM analytics_visits() WHERE since IS NULL OR first_at >= since),
       per_person AS (
         SELECT zone_id, user_id, count(DISTINCT night) AS nights
         FROM visits GROUP BY zone_id, user_id
       )
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result FROM (
    SELECT
      z.id AS zone_id, z.name AS name,
      (SELECT count(*) FROM visits v WHERE v.zone_id = z.id) AS checkins,
      (SELECT count(*) FROM per_person pp WHERE pp.zone_id = z.id) AS unique_visitors,
      (SELECT count(*) FROM per_person pp WHERE pp.zone_id = z.id AND pp.nights >= 2) AS returning_visitors,
      (SELECT count(*) FROM qr_scans q WHERE q.zone_id = z.id AND (since IS NULL OR q.scanned_at >= since)) AS scans,
      (SELECT count(*) FROM users u WHERE u.signup_zone_id = z.id AND (since IS NULL OR u.created_at >= since)) AS attributed_signups,
      (SELECT count(*) FROM venue_subscriptions vs JOIN users u ON u.id = vs.user_id
        WHERE vs.zone_id = z.id AND (since IS NULL OR vs.subscribed_at >= since)) AS subscriptions
    FROM zones z
    WHERE z.is_active = true
    ORDER BY (SELECT count(*) FROM visits v WHERE v.zone_id = z.id) DESC, z.name
  ) t;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_venue_performance(int) TO authenticated;

-- ── Retention + activation depth ──────────────────────────────────────────────
-- Rolling retention from the first visit. Of people whose first visit was at least
-- N days ago, the share who checked in again on a night at least N days after it
-- (d1 = came back on any later night). Each window reports its own denominator
-- (d1_of, d7_of, d30_of) so a small cohort is never mistaken for a big one.
CREATE OR REPLACE FUNCTION admin_retention()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  WITH visits AS (SELECT * FROM analytics_visits()),
       firsts AS (
         SELECT user_id, min(night) AS first_night, min(first_at) AS first_at
         FROM visits GROUP BY user_id
       ),
       per_user AS (
         SELECT f.user_id, f.first_at,
                -- latest night they came back, measured in days after the first
                max(v.night - f.first_night) AS last_gap
         FROM firsts f JOIN visits v ON v.user_id = f.user_id
         GROUP BY f.user_id, f.first_at
       ),
       windows AS (
         SELECT w.n,
                count(*) FILTER (WHERE p.first_at <= now() - make_interval(days => w.n)) AS cohort,
                count(*) FILTER (WHERE p.first_at <= now() - make_interval(days => w.n)
                                   AND p.last_gap >= w.n) AS retained
         FROM (VALUES (1), (7), (30)) AS w(n) CROSS JOIN per_user p
         GROUP BY w.n
       ),
       durations AS (SELECT minutes FROM visits WHERE minutes > 0)
  SELECT jsonb_build_object(
    'd1',       COALESCE((SELECT CASE WHEN cohort > 0 THEN round(100.0 * retained / cohort) ELSE 0 END FROM windows WHERE n = 1), 0),
    'd7',       COALESCE((SELECT CASE WHEN cohort > 0 THEN round(100.0 * retained / cohort) ELSE 0 END FROM windows WHERE n = 7), 0),
    'd30',      COALESCE((SELECT CASE WHEN cohort > 0 THEN round(100.0 * retained / cohort) ELSE 0 END FROM windows WHERE n = 30), 0),
    'd1_kept',  COALESCE((SELECT retained FROM windows WHERE n = 1), 0),
    'd1_of',    COALESCE((SELECT cohort   FROM windows WHERE n = 1), 0),
    'd7_kept',  COALESCE((SELECT retained FROM windows WHERE n = 7), 0),
    'd7_of',    COALESCE((SELECT cohort   FROM windows WHERE n = 7), 0),
    'd30_kept', COALESCE((SELECT retained FROM windows WHERE n = 30), 0),
    'd30_of',   COALESCE((SELECT cohort   FROM windows WHERE n = 30), 0),
    'activated_users', (SELECT count(*) FROM firsts),
    -- Key names kept for the shipped build. Check-ins here are visits.
    'avg_checkins_per_user', (
      SELECT CASE WHEN count(DISTINCT user_id) > 0
        THEN round(count(*)::numeric / count(DISTINCT user_id), 1) ELSE 0 END
      FROM visits),
    'avg_venues_per_user', (
      SELECT CASE WHEN count(DISTINCT user_id) > 0
        THEN round(count(DISTINCT (user_id, zone_id))::numeric / count(DISTINCT user_id), 1) ELSE 0 END
      FROM visits),
    'avg_session_minutes',    (SELECT COALESCE(round(avg(minutes)), 0) FROM durations),
    'median_session_minutes', (SELECT COALESCE(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)::numeric), 0) FROM durations)
  ) INTO result;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_retention() TO authenticated;

-- admin_rolling_retention(int) from admin_retention.sql is no longer used by
-- anything. Dropped so nobody reads the old signup-based number by mistake.
DROP FUNCTION IF EXISTS admin_rolling_retention(int);
