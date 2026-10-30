-- ═══════════════════════════════════════════════════════════════════════════
-- PARTNER STATS, DEFINED (Jacob, Oct 30 2026). Run once in Supabase, BEFORE
-- merging feat/partner-stats-defined. Needs supabase/venue_partners_oct30.sql.
--
-- Jacob: "What exactly qualifies as a 'new member'? Is that a new HereNow
-- registration during the activation, a new venue follower, or something
-- else? I want to make sure we're measuring something meaningful for
-- sponsors."
--
-- It was the third: people who joined the partner's own Organization page on
-- HereNow during the window, from anywhere. Real, but rarely what a sponsor
-- means. This keeps it, under a plain name, and adds the numbers a sponsor
-- usually asks about. Every number is a total over the partnership window
-- (start to the end, or to now, or to when the venue ended it early):
--
--   first_visits     people whose first-ever check-in at this venue was
--                    during the window (new faces in the door)
--   new_to_herenow   people who created their HereNow account during the
--                    window and checked in here during it
--   new_followers    people who started following the venue during the
--                    window and still follow it
--   org_joins        people who joined the partner's Organization on HereNow
--                    during the window (the old new_members, which stays in the
--                    result under its old name so the live web app keeps
--                    working until the new one deploys)
--
-- Unchanged: check_ins, guests, here_now, broadcasts, broadcast_reach,
-- contest_entries, and who may call it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION partner_stats(p_partner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v      venue_partners%ROWTYPE;
  v_to   timestamptz;
  v_joins bigint;
BEGIN
  SELECT * INTO v FROM venue_partners WHERE id = p_partner;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM zones WHERE id = v.zone_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin)
    OR (v.can_view_stats AND EXISTS (SELECT 1 FROM organizations WHERE id = v.org_id AND owner_id = auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  -- Count up to now, the end of the window, or the moment it was revoked.
  v_to := LEAST(now(), v.ends_at, COALESCE(v.revoked_at, v.ends_at));

  v_joins := (SELECT count(*) FROM organization_members m
              WHERE m.org_id = v.org_id AND m.joined_at >= v.starts_at AND m.joined_at < v_to);

  RETURN jsonb_build_object(
    -- Check-ins that started inside the window.
    'check_ins', (SELECT count(*) FROM sessions s
                  WHERE s.zone_id = v.zone_id AND s.checked_in_at >= v.starts_at AND s.checked_in_at < v_to),
    -- Different people in the venue at any point during the window.
    'guests', (SELECT count(DISTINCT s.user_id) FROM sessions s
               WHERE s.zone_id = v.zone_id AND s.checked_in_at < v_to
                 AND COALESCE(s.checked_out_at, now()) > v.starts_at),
    'here_now', (CASE WHEN now() BETWEEN v.starts_at AND v.ends_at AND v.revoked_at IS NULL
                      THEN (SELECT count(*) FROM sessions s WHERE s.zone_id = v.zone_id AND s.is_active)
                      ELSE 0 END),
    -- People whose very first check-in at this venue started inside the window.
    'first_visits', (SELECT count(*) FROM (
                       SELECT min(s.checked_in_at) AS first_at FROM sessions s
                       WHERE s.zone_id = v.zone_id
                       GROUP BY s.user_id
                     ) f
                     WHERE f.first_at >= v.starts_at AND f.first_at < v_to),
    -- New HereNow accounts that checked in here during the window.
    'new_to_herenow', (SELECT count(DISTINCT s.user_id) FROM sessions s
                       JOIN profiles p ON p.id = s.user_id
                       WHERE s.zone_id = v.zone_id
                         AND s.checked_in_at >= v.starts_at AND s.checked_in_at < v_to
                         AND p.created_at >= v.starts_at AND p.created_at < v_to),
    -- Started following the venue during the window (and still follow it).
    'new_followers', (SELECT count(*) FROM venue_subscriptions vs
                      WHERE vs.zone_id = v.zone_id
                        AND vs.subscribed_at >= v.starts_at AND vs.subscribed_at < v_to),
    'broadcasts', (SELECT count(*) FROM partner_broadcasts b WHERE b.partner_id = v.id),
    'broadcast_reach', (SELECT count(DISTINCT w.user_id) FROM partner_broadcast_views w
                        JOIN partner_broadcasts b ON b.id = w.broadcast_id
                        WHERE b.partner_id = v.id),
    'contest_entries', (SELECT count(*) FROM contest_entries e
                        JOIN contests c ON c.id = e.contest_id
                        WHERE c.org_id = v.org_id AND c.zone_id = v.zone_id
                          AND e.joined_at >= v.starts_at AND e.joined_at < v_to),
    'org_joins', v_joins,
    'new_members', v_joins
  );
END $$;
REVOKE ALL ON FUNCTION partner_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION partner_stats(uuid) TO authenticated;

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect true: the new definition is in place.
SELECT pg_get_functiondef('partner_stats(uuid)'::regprocedure) LIKE '%first_visits%' AS has_new_stats;
