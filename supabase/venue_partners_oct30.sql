-- ═══════════════════════════════════════════════════════════════════════════
-- VENUE PARTNERS (Jacob, Oct 29 2026). Run once in Supabase, BEFORE merging
-- feat/venue-partners. Run supabase/universal_feed_oct30.sql first.
--
-- "Monster at Skinny Dennis, Jack Daniel's at Nissan Stadium, Bud Light at
-- Bonnaroo." A venue makes an organization its partner for an event or a date
-- range, and picks what the partner may do while it lasts:
--
--   broadcast  post to the people checked in at the venue (they see it only
--              while they're checked in)
--   host       run contests and add events there, no approval step
--   stats      see the activation's numbers, as totals (never who)
--
-- The partner's people still use the venue like anyone else: check in, Pulse,
-- chat. Venues stay in control: they grant, they can revoke any time.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Grants ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id         uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           text CHECK (char_length(label) <= 80),
  can_broadcast   boolean NOT NULL DEFAULT true,
  can_host        boolean NOT NULL DEFAULT false,
  can_view_stats  boolean NOT NULL DEFAULT true,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  revoked_at      timestamptz,
  granted_by      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_partners_window CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_venue_partners_zone ON venue_partners (zone_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_partners_org  ON venue_partners (org_id, starts_at DESC);
ALTER TABLE venue_partners ENABLE ROW LEVEL SECURITY;

-- The venue, the partner and admins see every grant. Everyone else sees a
-- partnership only while it's live ("Presented with Monster" on the venue page),
-- so an unannounced activation stays unannounced.
DROP POLICY IF EXISTS "Venue partners readable" ON venue_partners;
CREATE POLICY "Venue partners readable" ON venue_partners FOR SELECT USING (
  (revoked_at IS NULL AND now() BETWEEN starts_at AND ends_at)
  OR EXISTS (SELECT 1 FROM zones z WHERE z.id = venue_partners.zone_id AND z.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = venue_partners.org_id AND o.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)
);
DROP POLICY IF EXISTS "Venue owner grants partners" ON venue_partners;
CREATE POLICY "Venue owner grants partners" ON venue_partners FOR INSERT WITH CHECK (
  granted_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM zones z WHERE z.id = venue_partners.zone_id AND z.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)
  )
);
DROP POLICY IF EXISTS "Venue owner edits partners" ON venue_partners;
CREATE POLICY "Venue owner edits partners" ON venue_partners FOR UPDATE USING (
  EXISTS (SELECT 1 FROM zones z WHERE z.id = venue_partners.zone_id AND z.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)
);
DROP POLICY IF EXISTS "Venue owner deletes partners" ON venue_partners;
CREATE POLICY "Venue owner deletes partners" ON venue_partners FOR DELETE USING (
  EXISTS (SELECT 1 FROM zones z WHERE z.id = venue_partners.zone_id AND z.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)
);

-- Does the caller own an active org that holds this permission at this venue?
-- 'broadcast' needs the grant live right now; 'host' also counts an upcoming
-- grant, so a sponsor can set up the contest before the night.
CREATE OR REPLACE FUNCTION partner_can(p_zone uuid, p_org uuid, p_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM venue_partners vp
    JOIN organizations o ON o.id = vp.org_id
    WHERE vp.zone_id = p_zone AND vp.org_id = p_org
      AND o.owner_id = auth.uid() AND o.status = 'active'
      AND vp.revoked_at IS NULL
      AND CASE p_perm
            WHEN 'broadcast' THEN vp.can_broadcast AND now() BETWEEN vp.starts_at AND vp.ends_at
            WHEN 'host'      THEN vp.can_host AND now() <= vp.ends_at
            ELSE false
          END
  ), false)
$$;

-- ── 2. Partner broadcasts (seen only by people checked in there) ────────────
CREATE TABLE IF NOT EXISTS partner_broadcasts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES venue_partners(id) ON DELETE CASCADE,
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message     text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_broadcasts_zone ON partner_broadcasts (zone_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_broadcasts_partner ON partner_broadcasts (partner_id);
ALTER TABLE partner_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner broadcasts readable in the room" ON partner_broadcasts;
CREATE POLICY "Partner broadcasts readable in the room" ON partner_broadcasts FOR SELECT USING (
  EXISTS (SELECT 1 FROM sessions s
          WHERE s.user_id = auth.uid() AND s.zone_id = partner_broadcasts.zone_id AND s.is_active)
  OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = partner_broadcasts.org_id AND o.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM zones z WHERE z.id = partner_broadcasts.zone_id AND z.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)
);
DROP POLICY IF EXISTS "Partners broadcast while their grant is live" ON partner_broadcasts;
CREATE POLICY "Partners broadcast while their grant is live" ON partner_broadcasts FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM venue_partners vp
              WHERE vp.id = partner_broadcasts.partner_id
                AND vp.zone_id = partner_broadcasts.zone_id
                AND vp.org_id = partner_broadcasts.org_id)
  AND partner_can(partner_broadcasts.zone_id, partner_broadcasts.org_id, 'broadcast')
);
DROP POLICY IF EXISTS "Partner or venue deletes broadcasts" ON partner_broadcasts;
CREATE POLICY "Partner or venue deletes broadcasts" ON partner_broadcasts FOR DELETE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM zones z WHERE z.id = partner_broadcasts.zone_id AND z.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)
);

-- Who saw a partner broadcast, for its reach number. Never read back by the
-- app directly; partner_stats() returns the count.
CREATE TABLE IF NOT EXISTS partner_broadcast_views (
  broadcast_id  uuid NOT NULL REFERENCES partner_broadcasts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (broadcast_id, user_id)
);
ALTER TABLE partner_broadcast_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Log your own partner broadcast views" ON partner_broadcast_views;
CREATE POLICY "Log your own partner broadcast views" ON partner_broadcast_views FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── 3. The activation's numbers (totals only) ───────────────────────────────
CREATE OR REPLACE FUNCTION partner_stats(p_partner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v    venue_partners%ROWTYPE;
  v_to timestamptz;
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
    'broadcasts', (SELECT count(*) FROM partner_broadcasts b WHERE b.partner_id = v.id),
    'broadcast_reach', (SELECT count(DISTINCT w.user_id) FROM partner_broadcast_views w
                        JOIN partner_broadcasts b ON b.id = w.broadcast_id
                        WHERE b.partner_id = v.id),
    'contest_entries', (SELECT count(*) FROM contest_entries e
                        JOIN contests c ON c.id = e.contest_id
                        WHERE c.org_id = v.org_id AND c.zone_id = v.zone_id
                          AND e.joined_at >= v.starts_at AND e.joined_at < v_to),
    'new_members', (SELECT count(*) FROM organization_members m
                    WHERE m.org_id = v.org_id AND m.joined_at >= v.starts_at AND m.joined_at < v_to)
  );
END $$;
REVOKE ALL ON FUNCTION partner_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION partner_stats(uuid) TO authenticated;

-- ── 4. Hosting: contests ────────────────────────────────────────────────────
-- contest_save from supabase/live_contests.sql, unchanged except that an org
-- with a 'host' grant at the venue may create a contest there, already
-- approved (the venue approved it by granting).
CREATE OR REPLACE FUNCTION contest_save(p_contest uuid, p_zone uuid, p_org uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_admin    boolean;
  v_owner    boolean;
  v_partner  boolean;
  v_id       uuid;
  v_c        contests%ROWTYPE;
  v_attempts boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND is_banned) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  SELECT COALESCE(is_admin, false) INTO v_admin FROM profiles WHERE id = v_uid;
  v_admin := COALESCE(v_admin, false);

  IF p_contest IS NULL THEN
    IF p_zone IS NULL THEN RAISE EXCEPTION 'no_venue'; END IF;
    v_owner := EXISTS (SELECT 1 FROM zones WHERE id = p_zone AND owner_id = v_uid);
    v_partner := p_org IS NOT NULL AND partner_can(p_zone, p_org, 'host');
    IF p_org IS NOT NULL AND NOT v_admin AND NOT v_partner AND NOT EXISTS (
      SELECT 1 FROM organizations
      WHERE id = p_org AND owner_id = v_uid AND host_zone_id = p_zone AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
    IF NOT (v_owner OR v_admin OR p_org IS NOT NULL) THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
    IF NULLIF(btrim(p->>'title'), '') IS NULL THEN RAISE EXCEPTION 'title_required'; END IF;

    INSERT INTO contests (zone_id, org_id, created_by, title, venue_approved)
    VALUES (p_zone, p_org, v_uid, btrim(p->>'title'), v_owner OR v_admin OR v_partner)
    RETURNING id INTO v_id;
  ELSE
    IF NOT contest_can_manage(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
    v_id := p_contest;
  END IF;

  SELECT * INTO v_c FROM contests WHERE id = v_id FOR UPDATE;

  -- Flipping who wins after scores exist would silently reorder the board.
  IF p ? 'higher_wins' AND (p->>'higher_wins')::boolean IS DISTINCT FROM v_c.higher_wins THEN
    v_attempts := EXISTS (SELECT 1 FROM contest_attempts WHERE contest_id = v_id AND NOT voided);
    IF v_attempts THEN RAISE EXCEPTION 'scoring_locked'; END IF;
  END IF;

  UPDATE contests SET
    title              = CASE WHEN p ? 'title' THEN COALESCE(NULLIF(btrim(p->>'title'), ''), title) ELSE title END,
    tagline            = CASE WHEN p ? 'tagline'      THEN NULLIF(btrim(p->>'tagline'), '')      ELSE tagline END,
    presented_by       = CASE WHEN p ? 'presented_by' THEN NULLIF(btrim(p->>'presented_by'), '') ELSE presented_by END,
    logo_url           = CASE WHEN p ? 'logo_url'     THEN NULLIF(btrim(p->>'logo_url'), '')     ELSE logo_url END,
    banner_url         = CASE WHEN p ? 'banner_url'   THEN NULLIF(btrim(p->>'banner_url'), '')   ELSE banner_url END,
    accent_color       = CASE WHEN p ? 'accent_color' THEN COALESCE(NULLIF(btrim(p->>'accent_color'), ''), accent_color) ELSE accent_color END,
    rules              = CASE WHEN p ? 'rules'        THEN NULLIF(btrim(p->>'rules'), '')        ELSE rules END,
    prizes             = CASE WHEN p ? 'prizes'       THEN NULLIF(btrim(p->>'prizes'), '')       ELSE prizes END,
    starts_at          = CASE WHEN p ? 'starts_at'    THEN NULLIF(p->>'starts_at', '')::timestamptz ELSE starts_at END,
    score_label        = CASE WHEN p ? 'score_label'  THEN COALESCE(NULLIF(btrim(p->>'score_label'), ''), 'Score') ELSE score_label END,
    score_suffix       = CASE WHEN p ? 'score_suffix' THEN COALESCE(btrim(p->>'score_suffix'), '') ELSE score_suffix END,
    score_decimals     = CASE WHEN p ? 'score_decimals'     THEN (p->>'score_decimals')::int     ELSE score_decimals END,
    higher_wins        = CASE WHEN p ? 'higher_wins'        THEN (p->>'higher_wins')::boolean    ELSE higher_wins END,
    attempts_per_entry = CASE WHEN p ? 'attempts_per_entry' THEN (p->>'attempts_per_entry')::int ELSE attempts_per_entry END,
    max_entries        = CASE WHEN p ? 'max_entries'  THEN NULLIF(p->>'max_entries', '')::int ELSE max_entries END,
    status             = CASE WHEN p ? 'status' AND p->>'status' IN ('draft','scheduled')
                              AND status IN ('draft','scheduled') THEN p->>'status' ELSE status END
  WHERE id = v_id;

  PERFORM contest_touch(v_id);
  RETURN v_id;
END $$;

-- ── 5. Hosting: events ──────────────────────────────────────────────────────
-- The policy from supabase/venue_events_insert_policy.sql, plus a fourth
-- author: an org with a 'host' grant at the venue, for an event tagged with it.
DROP POLICY IF EXISTS "Venue owners, org owners and members create events" ON venue_events;
CREATE POLICY "Venue owners, org owners and members create events"
  ON venue_events FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND (
      EXISTS (
        SELECT 1 FROM zones z
        WHERE z.id = venue_events.zone_id AND z.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM organizations o
        WHERE o.owner_id = auth.uid() AND o.host_zone_id = venue_events.zone_id
      )
      OR EXISTS (
        SELECT 1 FROM zone_members m
        WHERE m.zone_id = venue_events.zone_id AND m.user_id = auth.uid()
      )
      OR (venue_events.org_id IS NOT NULL
          AND partner_can(venue_events.zone_id, venue_events.org_id, 'host'))
    )
  );

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect three tables and two functions.
SELECT 'table' AS kind, table_name AS name FROM information_schema.tables
WHERE table_name IN ('venue_partners', 'partner_broadcasts', 'partner_broadcast_views')
UNION ALL
SELECT 'function', routine_name FROM information_schema.routines
WHERE routine_name IN ('partner_can', 'partner_stats');
