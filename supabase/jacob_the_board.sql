-- ═══════════════════════════════════════════════════════════════════════════
-- THE BOARD (Jacob's feature proposal, July 16 2026). Run once in Supabase.
--
-- A digital bulletin board per venue. Access (view AND post) requires being
-- currently checked in AND subscribed — the Board belongs to the venue's
-- actual community, not to people browsing from home. Venue owners always see
-- their own Board (moderation).
--
-- Pins are instant (no approval queue). Read-only categories take Like/Save/
-- Report; respondable categories add Respond → a temporary, pin-scoped thread
-- that never becomes a DM and never creates a social connection (protects the
-- We Met system). Contact exchange inside a Response requires BOTH parties to
-- opt in before anything is revealed.
--
-- ANONYMITY DESIGN: board_pins has NO client SELECT policy at all. Every read
-- goes through SECURITY DEFINER RPCs that mask the author on anonymous pins —
-- so user_id can never leak through the REST API, not even to the venue owner.
-- Responses resolve their owner via a server-side trigger for the same reason.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Pins ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_pins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id          uuid NOT NULL REFERENCES zones(id)    ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category         text NOT NULL CHECK (category IN (
    -- read-only
    'poetry','thoughts','humor','missed_connections','community','flyers','art',
    -- respondable
    'for_sale','tickets','housing','looking_for','jobs','collab','lost_found'
  )),
  title            text NOT NULL,
  body             text NOT NULL,
  image_url        text DEFAULT NULL,
  is_anonymous     boolean NOT NULL DEFAULT false,
  -- active | complete (sold/done, stays visible) | hidden (moderation/reports)
  -- | removed (gone from the feed)
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','complete','hidden','removed')),
  responses_closed boolean NOT NULL DEFAULT false,
  is_pinned        boolean NOT NULL DEFAULT false,   -- venue pin-to-top
  report_count     int     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_board_pins_zone ON board_pins (zone_id, created_at DESC);

-- ── 2. Likes / Saves ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_pin_likes (
  pin_id     uuid NOT NULL REFERENCES board_pins(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pin_id, user_id)
);
CREATE TABLE IF NOT EXISTS board_pin_saves (
  pin_id     uuid NOT NULL REFERENCES board_pins(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pin_id, user_id)
);

-- ── 3. Reports (auto-hide at 2 distinct reporters, pending review) ───────────
CREATE TABLE IF NOT EXISTS board_pin_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id      uuid NOT NULL REFERENCES board_pins(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  reason      text DEFAULT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, reporter_id)
);

-- ── 4. Board bans (venue owner can ban a user from posting to their Board) ──
CREATE TABLE IF NOT EXISTS board_bans (
  zone_id    uuid NOT NULL REFERENCES zones(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  banned_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, user_id)
);

-- ── 5. Responses — temporary, pin-scoped threads ─────────────────────────────
CREATE TABLE IF NOT EXISTS board_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id          uuid NOT NULL REFERENCES board_pins(id) ON DELETE CASCADE,
  zone_id         uuid NOT NULL REFERENCES zones(id)      ON DELETE CASCADE,
  responder_id    uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, responder_id)
);

CREATE TABLE IF NOT EXISTS board_response_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES board_responses(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_board_response_messages
  ON board_response_messages (response_id, created_at);

-- ── 6. Contact exchange — revealed only when BOTH parties have shared ────────
CREATE TABLE IF NOT EXISTS board_contact_shares (
  response_id uuid NOT NULL REFERENCES board_responses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  contact     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (response_id, user_id)
);

-- ── 7. Helpers (SECURITY DEFINER — bypass RLS inside, never recurse) ─────────

-- The Board's access rule: venue owner, OR (currently checked in AND subscriber).
CREATE OR REPLACE FUNCTION board_can_access(p_zone uuid, p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    EXISTS (SELECT 1 FROM zones z WHERE z.id = p_zone AND z.owner_id = p_user)
    OR (
      EXISTS (SELECT 1 FROM sessions s
              WHERE s.zone_id = p_zone AND s.user_id = p_user
                AND s.is_active = true
                AND s.last_seen_at > now() - INTERVAL '30 minutes')
      AND EXISTS (SELECT 1 FROM venue_subscriptions vs
                  WHERE vs.zone_id = p_zone AND vs.user_id = p_user
                    AND vs.is_subscriber = true)
    );
$$;

-- Is this pin open to a NEW response from this user? (active, responses not
-- closed, and not their own pin.) Definer so the response INSERT policy can
-- check pin state without a client-readable pins table.
CREATE OR REPLACE FUNCTION board_pin_open_for_response(p_pin uuid, p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_pins p
    WHERE p.id = p_pin
      AND p.status = 'active'
      AND p.responses_closed = false
      AND p.user_id <> p_user
  );
$$;

-- Have both parties of a response shared contact info?
CREATE OR REPLACE FUNCTION board_mutual_share(p_response uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT (SELECT count(*) FROM board_contact_shares WHERE response_id = p_response) >= 2;
$$;

-- Server-side owner resolution: the responder never needs to read the pin's
-- user_id (which would unmask anonymous posters). BEFORE triggers run before
-- NOT NULL checks and RLS WITH CHECK, so inserts only need pin_id+responder.
CREATE OR REPLACE FUNCTION board_response_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SELECT p.user_id, p.zone_id INTO NEW.owner_id, NEW.zone_id
  FROM board_pins p WHERE p.id = NEW.pin_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_board_response_fill ON board_responses;
CREATE TRIGGER trg_board_response_fill
  BEFORE INSERT ON board_responses
  FOR EACH ROW EXECUTE FUNCTION board_response_fill();

-- ── 8. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE board_pins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_pin_likes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_pin_saves         ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_pin_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_bans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_responses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_response_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_contact_shares    ENABLE ROW LEVEL SECURITY;

-- Pins: NO SELECT policy on purpose — reads only via the masking RPCs below.
-- Writes:
DROP POLICY IF EXISTS "Community members pin to board" ON board_pins;
CREATE POLICY "Community members pin to board" ON board_pins FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND board_can_access(zone_id, auth.uid())
  AND NOT EXISTS (SELECT 1 FROM board_bans b
                  WHERE b.zone_id = board_pins.zone_id AND b.user_id = auth.uid())
);

-- Author edits/manages their own pin; venue owner moderates any pin.
DROP POLICY IF EXISTS "Author or venue owner updates pins" ON board_pins;
CREATE POLICY "Author or venue owner updates pins" ON board_pins FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM zones z WHERE z.id = board_pins.zone_id AND z.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Author or venue owner deletes pins" ON board_pins;
CREATE POLICY "Author or venue owner deletes pins" ON board_pins FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM zones z WHERE z.id = board_pins.zone_id AND z.owner_id = auth.uid())
);

-- Likes / saves: manage your own; counts come from the feed RPC.
DROP POLICY IF EXISTS "Own likes" ON board_pin_likes;
CREATE POLICY "Own likes" ON board_pin_likes FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Own saves" ON board_pin_saves;
CREATE POLICY "Own saves" ON board_pin_saves FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Reports: inserted via RPC (SECURITY DEFINER); readable by the reporter.
DROP POLICY IF EXISTS "Own reports" ON board_pin_reports;
CREATE POLICY "Own reports" ON board_pin_reports FOR SELECT USING (reporter_id = auth.uid());

-- Bans: venue owner manages; the banned user can see their own ban.
DROP POLICY IF EXISTS "Venue owner manages board bans" ON board_bans;
CREATE POLICY "Venue owner manages board bans" ON board_bans FOR ALL
  USING (EXISTS (SELECT 1 FROM zones z WHERE z.id = board_bans.zone_id AND z.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM zones z WHERE z.id = board_bans.zone_id AND z.owner_id = auth.uid()));
DROP POLICY IF EXISTS "See own board ban" ON board_bans;
CREATE POLICY "See own board ban" ON board_bans FOR SELECT USING (user_id = auth.uid());

-- Responses: only the two parties.
DROP POLICY IF EXISTS "Parties read responses" ON board_responses;
CREATE POLICY "Parties read responses" ON board_responses FOR SELECT USING (
  responder_id = auth.uid() OR owner_id = auth.uid()
);
DROP POLICY IF EXISTS "Community responds to open pins" ON board_responses;
CREATE POLICY "Community responds to open pins" ON board_responses FOR INSERT WITH CHECK (
  responder_id = auth.uid()
  AND board_can_access(zone_id, auth.uid())
  AND board_pin_open_for_response(pin_id, auth.uid())
);
DROP POLICY IF EXISTS "Parties update responses" ON board_responses;
CREATE POLICY "Parties update responses" ON board_responses FOR UPDATE USING (
  responder_id = auth.uid() OR owner_id = auth.uid()
);
DROP POLICY IF EXISTS "Parties delete responses" ON board_responses;
CREATE POLICY "Parties delete responses" ON board_responses FOR DELETE USING (
  responder_id = auth.uid() OR owner_id = auth.uid()
);

-- Response messages: only the two parties; sender must be a party.
DROP POLICY IF EXISTS "Parties read response messages" ON board_response_messages;
CREATE POLICY "Parties read response messages" ON board_response_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM board_responses r
          WHERE r.id = board_response_messages.response_id
            AND (r.responder_id = auth.uid() OR r.owner_id = auth.uid()))
);
DROP POLICY IF EXISTS "Parties send response messages" ON board_response_messages;
CREATE POLICY "Parties send response messages" ON board_response_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (SELECT 1 FROM board_responses r
              WHERE r.id = board_response_messages.response_id
                AND (r.responder_id = auth.uid() OR r.owner_id = auth.uid()))
);

-- Contact shares: your own row always; the OTHER party's row only once BOTH
-- have shared (mutual consent enforced server-side, not just in the UI).
DROP POLICY IF EXISTS "Own contact share" ON board_contact_shares;
CREATE POLICY "Own contact share" ON board_contact_shares FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM board_responses r
                WHERE r.id = board_contact_shares.response_id
                  AND (r.responder_id = auth.uid() OR r.owner_id = auth.uid()))
  );
DROP POLICY IF EXISTS "Mutual contact reveal" ON board_contact_shares;
CREATE POLICY "Mutual contact reveal" ON board_contact_shares FOR SELECT USING (
  EXISTS (SELECT 1 FROM board_responses r
          WHERE r.id = board_contact_shares.response_id
            AND (r.responder_id = auth.uid() OR r.owner_id = auth.uid()))
  AND board_mutual_share(response_id)
);

-- ── 9. The feed RPC — the ONLY way pins are read; masks anonymous authors ────
DROP FUNCTION IF EXISTS board_pins_for_zone(uuid);
CREATE FUNCTION board_pins_for_zone(zone_uuid uuid)
RETURNS TABLE (
  id uuid, zone_id uuid, category text, title text, body text, image_url text,
  is_anonymous boolean, status text, responses_closed boolean, is_pinned boolean,
  created_at timestamptz, author_id uuid, author_name text, is_own boolean,
  like_count int, save_count int, liked boolean, saved boolean,
  response_count int, my_response_id uuid
) AS $$
  SELECT
    p.id, p.zone_id, p.category, p.title, p.body, p.image_url,
    p.is_anonymous, p.status, p.responses_closed, p.is_pinned, p.created_at,
    -- Anonymous pins stay anonymous to EVERYONE except the author themself —
    -- including the venue owner (moderation works on the pin, not the person).
    CASE WHEN p.is_anonymous AND p.user_id <> auth.uid() THEN NULL ELSE p.user_id END,
    CASE WHEN p.is_anonymous AND p.user_id <> auth.uid() THEN NULL ELSE pr.display_name END,
    (p.user_id = auth.uid()),
    (SELECT count(*)::int FROM board_pin_likes l  WHERE l.pin_id  = p.id),
    (SELECT count(*)::int FROM board_pin_saves sv WHERE sv.pin_id = p.id),
    EXISTS (SELECT 1 FROM board_pin_likes l  WHERE l.pin_id  = p.id AND l.user_id  = auth.uid()),
    EXISTS (SELECT 1 FROM board_pin_saves sv WHERE sv.pin_id = p.id AND sv.user_id = auth.uid()),
    (SELECT count(*)::int FROM board_responses r WHERE r.pin_id = p.id),
    (SELECT r.id FROM board_responses r WHERE r.pin_id = p.id AND r.responder_id = auth.uid() LIMIT 1)
  FROM board_pins p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.zone_id = zone_uuid
    AND board_can_access(zone_uuid, auth.uid())
    AND (
      p.status IN ('active','complete')
      -- hidden pins stay visible to their author and the venue owner
      OR (p.status = 'hidden' AND (
            p.user_id = auth.uid()
            OR EXISTS (SELECT 1 FROM zones z WHERE z.id = zone_uuid AND z.owner_id = auth.uid())))
    )
  ORDER BY p.is_pinned DESC, p.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 10. Report RPC — auto-hide at 2 distinct reporters ───────────────────────
CREATE OR REPLACE FUNCTION board_report_pin(p_pin uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO board_pin_reports (pin_id, reporter_id, reason)
  VALUES (p_pin, auth.uid(), p_reason)
  ON CONFLICT (pin_id, reporter_id) DO NOTHING;

  SELECT count(*) INTO n FROM board_pin_reports WHERE pin_id = p_pin;
  UPDATE board_pins
  SET report_count = n,
      status = CASE WHEN n >= 2 AND status = 'active' THEN 'hidden' ELSE status END
  WHERE id = p_pin;
END $$;

-- ── 11. Ban-from-board RPC — moderation without unmasking anonymity ──────────
CREATE OR REPLACE FUNCTION board_ban_pin_author(p_pin uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_zone uuid; v_author uuid;
BEGIN
  SELECT p.zone_id, p.user_id INTO v_zone, v_author FROM board_pins p WHERE p.id = p_pin;
  IF v_zone IS NULL THEN RETURN; END IF;
  -- Caller must own the venue.
  IF NOT EXISTS (SELECT 1 FROM zones z WHERE z.id = v_zone AND z.owner_id = auth.uid()) THEN
    RETURN;
  END IF;
  INSERT INTO board_bans (zone_id, user_id, banned_by)
  VALUES (v_zone, v_author, auth.uid())
  ON CONFLICT (zone_id, user_id) DO NOTHING;
END $$;

-- ── 12. Response inbox RPC — the "Responses" section in Messages ─────────────
-- Threads expire on inactivity (7 days without a message = locked in the app;
-- dropped from the list after 30). Removed pins take their threads with them.
DROP FUNCTION IF EXISTS board_my_response_threads();
CREATE FUNCTION board_my_response_threads()
RETURNS TABLE (
  response_id uuid, pin_id uuid, zone_id uuid, zone_name text,
  pin_title text, pin_category text, pin_status text, responses_closed boolean,
  is_owner boolean, other_name text,
  created_at timestamptz, last_message_at timestamptz, last_message text
) AS $$
  SELECT
    r.id, r.pin_id, r.zone_id, z.name,
    p.title, p.category, p.status, p.responses_closed,
    (r.owner_id = auth.uid()),
    CASE
      -- Responders are never anonymous to the pin owner.
      WHEN r.owner_id = auth.uid() THEN pr_resp.display_name
      -- An anonymous pin's owner stays anonymous to responders.
      WHEN p.is_anonymous THEN NULL
      ELSE pr_own.display_name
    END,
    r.created_at, r.last_message_at,
    (SELECT m.content FROM board_response_messages m
     WHERE m.response_id = r.id ORDER BY m.created_at DESC LIMIT 1)
  FROM board_responses r
  JOIN board_pins p       ON p.id = r.pin_id
  JOIN zones z            ON z.id = r.zone_id
  JOIN profiles pr_resp   ON pr_resp.id = r.responder_id
  JOIN profiles pr_own    ON pr_own.id  = r.owner_id
  WHERE (r.responder_id = auth.uid() OR r.owner_id = auth.uid())
    AND p.status <> 'removed'
    AND r.last_message_at > now() - INTERVAL '30 days'
  ORDER BY r.last_message_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;
