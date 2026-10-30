-- ═══════════════════════════════════════════════════════════════════════════
-- SPONSOR REACH FIX (dry run, Oct 30 2026). Run once in Supabase. No app build
-- is needed for the first part; it starts working on every phone and the web
-- as soon as this runs.
--
-- 1. "Saw a broadcast" could never count anyone. The app logs a view with
--    upsert (INSERT ... ON CONFLICT DO NOTHING), and Postgres refuses that
--    under RLS unless the inserting user may also SELECT the row. The table
--    only had an INSERT policy, so every view log came back 42501 "new row
--    violates row-level security policy", found in the dry run: a plain insert
--    of the same row returned 201, the upsert 403. promo_views is built the
--    same way (its only SELECT policy is the venue owner's), so a guest's
--    promotion views are dropped too. Each user may now read only their own
--    view rows, which is all ON CONFLICT needs; nobody else's become visible.
--
-- 2. "Joined <brand> on HereNow" counted the person who created the
--    organization, since the founder joins their own org automatically. The
--    org's owner is now left out of that number.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Let view logs upsert ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Read your own partner broadcast views" ON partner_broadcast_views;
CREATE POLICY "Read your own partner broadcast views" ON partner_broadcast_views
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own promo views" ON promo_views;
CREATE POLICY "Users read own promo views" ON promo_views
  FOR SELECT USING (user_id = auth.uid());

-- ── 2. partner_stats: the org's owner isn't a new member ────────────────────
-- Same as supabase/partner_stats_oct30.sql except v_joins.
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

  v_to := LEAST(now(), v.ends_at, COALESCE(v.revoked_at, v.ends_at));

  v_joins := (SELECT count(*) FROM organization_members m
              JOIN organizations o ON o.id = m.org_id
              WHERE m.org_id = v.org_id AND m.user_id <> o.owner_id
                AND m.joined_at >= v.starts_at AND m.joined_at < v_to);

  RETURN jsonb_build_object(
    'check_ins', (SELECT count(*) FROM sessions s
                  WHERE s.zone_id = v.zone_id AND s.checked_in_at >= v.starts_at AND s.checked_in_at < v_to),
    'guests', (SELECT count(DISTINCT s.user_id) FROM sessions s
               WHERE s.zone_id = v.zone_id AND s.checked_in_at < v_to
                 AND COALESCE(s.checked_out_at, now()) > v.starts_at),
    'here_now', (CASE WHEN now() BETWEEN v.starts_at AND v.ends_at AND v.revoked_at IS NULL
                      THEN (SELECT count(*) FROM sessions s WHERE s.zone_id = v.zone_id AND s.is_active)
                      ELSE 0 END),
    'first_visits', (SELECT count(*) FROM (
                       SELECT min(s.checked_in_at) AS first_at FROM sessions s
                       WHERE s.zone_id = v.zone_id
                       GROUP BY s.user_id
                     ) f
                     WHERE f.first_at >= v.starts_at AND f.first_at < v_to),
    'new_to_herenow', (SELECT count(DISTINCT s.user_id) FROM sessions s
                       JOIN profiles p ON p.id = s.user_id
                       WHERE s.zone_id = v.zone_id
                         AND s.checked_in_at >= v.starts_at AND s.checked_in_at < v_to
                         AND p.created_at >= v.starts_at AND p.created_at < v_to),
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
-- Expect two rows (the new SELECT policies) and owner_excluded = true.
SELECT tablename, policyname FROM pg_policies
WHERE policyname IN ('Read your own partner broadcast views', 'Users read own promo views');
SELECT pg_get_functiondef('partner_stats(uuid)'::regprocedure) LIKE '%m.user_id <> o.owner_id%' AS owner_excluded;
