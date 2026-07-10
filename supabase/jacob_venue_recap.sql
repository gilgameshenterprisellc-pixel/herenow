-- Venue nightly recap / afterglow (Jacob feedback 6, Alex's #1). Run once.
--
-- Returns ONLY aggregates for a venue's day: check-ins, unique visitors, peak
-- hour, average dwell, new vs returning, social-mode mix, and an ANONYMIZED
-- cross-venue flow (where patrons came from / went to). Owner-gated, and the
-- came-from / went-to lists only include venues reached by 3+ distinct patrons
-- so no individual movement is ever exposed.
--
-- SECURITY DEFINER so the cross-venue aggregation can read sessions at other
-- venues, but the function never returns anything but counts.
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
      FROM (SELECT social_mode, count(*) AS n FROM day_sessions GROUP BY social_mode) x
    ),
    'came_from',       (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('venue', venue, 'count', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT z.name AS venue, count(DISTINCT cf.user_id) AS n
        FROM came_from_raw cf JOIN zones z ON z.id = cf.zone_id
        GROUP BY z.name HAVING count(DISTINCT cf.user_id) >= 3
      ) a
    ),
    'went_to',         (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('venue', venue, 'count', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT z.name AS venue, count(DISTINCT wt.user_id) AS n
        FROM went_to_raw wt JOIN zones z ON z.id = wt.zone_id
        GROUP BY z.name HAVING count(DISTINCT wt.user_id) >= 3
      ) b
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION venue_daily_recap(uuid, date) TO authenticated;
