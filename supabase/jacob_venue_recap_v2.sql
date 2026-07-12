-- Venue nightly recap v2 (Jacob build 8). Run once. Supersedes jacob_venue_recap.sql.
--
-- Two changes from v1, both from Jacob's build-8 feedback:
--   1. Cross-venue flow (came_from / went_to) NO LONGER needs a 3+ patron
--      threshold. Jacob wants every hop logged for richer intel. It stays
--      anonymous — only venue names + counts are returned, never any identity.
--   2. Adds age_ranges + interests to the recap so last night's crowd makeup
--      shows even when nobody is currently checked in (the live "in the room"
--      cards need live presence; the recap now carries the same breakdown).
--
-- SECURITY DEFINER so the cross-venue aggregation can read sessions at other
-- venues, but the function never returns anything but counts. Owner-gated.
-- Peak hour is computed in America/Chicago (Nashville launch).

CREATE OR REPLACE FUNCTION venue_daily_recap(p_zone_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_start timestamptz;
  v_end   timestamptz;
  result  jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM zones WHERE id = p_zone_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- The "day" runs 6am -> 6am local so a late night counts as one night.
  v_start := (p_date::timestamptz AT TIME ZONE 'America/Chicago') + interval '6 hours';
  v_end   := v_start + interval '24 hours';

  WITH day_sessions AS (
    SELECT s.user_id, s.checked_in_at, s.checked_out_at, s.social_mode
    FROM sessions s
    WHERE s.zone_id = p_zone_id
      AND s.checked_in_at >= v_start
      AND s.checked_in_at <  v_end
  ),
  visitors AS (
    SELECT DISTINCT user_id FROM day_sessions
  ),
  new_returning AS (
    SELECT
      v.user_id,
      EXISTS (
        SELECT 1 FROM sessions p
        WHERE p.zone_id = p_zone_id AND p.user_id = v.user_id AND p.checked_in_at < v_start
      ) AS is_returning
    FROM visitors v
  ),
  -- Where patrons came from: their last check-in at another venue in the 6h
  -- before arriving here that night.
  came_from_raw AS (
    SELECT DISTINCT ON (d.user_id, d.checked_in_at) prev.zone_id, d.user_id
    FROM day_sessions d
    JOIN sessions prev
      ON prev.user_id = d.user_id
     AND prev.zone_id <> p_zone_id
     AND prev.checked_in_at <  d.checked_in_at
     AND prev.checked_in_at >= d.checked_in_at - interval '6 hours'
    ORDER BY d.user_id, d.checked_in_at, prev.checked_in_at DESC
  ),
  -- Where patrons went next: first check-in at another venue in the 6h after
  -- leaving here.
  went_to_raw AS (
    SELECT DISTINCT ON (d.user_id, d.checked_in_at) nxt.zone_id, d.user_id
    FROM day_sessions d
    JOIN sessions nxt
      ON nxt.user_id = d.user_id
     AND nxt.zone_id <> p_zone_id
     AND nxt.checked_in_at >  COALESCE(d.checked_out_at, d.checked_in_at)
     AND nxt.checked_in_at <= COALESCE(d.checked_out_at, d.checked_in_at) + interval '6 hours'
    ORDER BY d.user_id, d.checked_in_at, nxt.checked_in_at ASC
  )
  SELECT jsonb_build_object(
    'date',            p_date,
    'total_checkins',  (SELECT count(*) FROM day_sessions),
    'unique_visitors', (SELECT count(*) FROM visitors),
    'new_visitors',    (SELECT count(*) FROM new_returning WHERE NOT is_returning),
    'returning',       (SELECT count(*) FROM new_returning WHERE is_returning),
    'avg_dwell_mins',  (
      SELECT COALESCE(round(avg(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at)) / 60))::int, 0)
      FROM day_sessions WHERE checked_out_at IS NOT NULL
    ),
    'peak_hour',       (
      SELECT EXTRACT(HOUR FROM (checked_in_at AT TIME ZONE 'America/Chicago'))::int
      FROM day_sessions
      GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1
    ),
    'social_modes',    (
      SELECT COALESCE(jsonb_object_agg(social_mode, n), '{}'::jsonb)
      FROM (SELECT social_mode, count(*) AS n FROM day_sessions WHERE social_mode IS NOT NULL GROUP BY social_mode) x
    ),
    -- Age ranges of the night's unique visitors (aggregate only).
    'age_ranges',      (
      SELECT COALESCE(jsonb_object_agg(age_range, n), '{}'::jsonb)
      FROM (
        SELECT p.age_range, count(*) AS n
        FROM visitors v JOIN profiles p ON p.id = v.user_id
        WHERE p.age_range IS NOT NULL
        GROUP BY p.age_range
      ) x
    ),
    -- Top interests across the night's unique visitors (aggregate only, top 8).
    'interests',       (
      SELECT COALESCE(jsonb_object_agg(tag, n), '{}'::jsonb)
      FROM (
        SELECT tag, count(*) AS n
        FROM visitors v
        JOIN profiles p ON p.id = v.user_id,
        LATERAL unnest(COALESCE(p.interest_tags, '{}')) AS tag
        GROUP BY tag
        ORDER BY count(*) DESC
        LIMIT 8
      ) x
    ),
    'came_from',       (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('venue', venue, 'count', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT z.name AS venue, count(DISTINCT cf.user_id) AS n
        FROM came_from_raw cf JOIN zones z ON z.id = cf.zone_id
        GROUP BY z.name HAVING count(DISTINCT cf.user_id) >= 1
      ) a
    ),
    'went_to',         (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('venue', venue, 'count', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT z.name AS venue, count(DISTINCT wt.user_id) AS n
        FROM went_to_raw wt JOIN zones z ON z.id = wt.zone_id
        GROUP BY z.name HAVING count(DISTINCT wt.user_id) >= 1
      ) b
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION venue_daily_recap(uuid, date) TO authenticated;
