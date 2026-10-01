-- Apple Guideline 1.2 (Safety, User Generated Content), rejection Sept 29 2026
-- on the same submission, after the Sept 22 round. Apple lists the full set of
-- precautions both times without saying which one is missing, so this audits all
-- of them against the code instead of guessing. Run once in the Supabase SQL
-- editor. Idempotent: safe to run twice.
--
-- What the audit found:
--   * "Block" only hid someone from the People carousel. The user_blocks table was
--     never read anywhere else, so a blocked user still showed up in Pulse and
--     Chat and could still send We Met requests and DMs. The Block prompt even
--     told people "they won't be able to send you We Met requests", which was
--     false. Blocks are now enforced here, in the database.
--   * The "mutual" half of fetchBlockedIds() never worked: user_blocks RLS only
--     lets you read the rows you created, so "people who blocked me" always came
--     back empty. is_blocked_between() below is SECURITY DEFINER and fixes that
--     without letting anyone read other people's block lists.
--   * Board responses (the anonymous channel) had no way to report or block the
--     other person, and nobody could block an anonymous pin's author at all.
--     The RPCs below do both server-side without ever revealing who the person is.
--   * Reporting a Board pin did not hide it for the reporter.
--   * Nothing told an admin a report had arrived, so "act within 24 hours" was a
--     promise with no alarm behind it.

-- ── 1. user_blocks: remember what the person was called, enforce both ways ────
-- label/source exist so Settings > Blocked users can show something meaningful
-- ("Guest 3 in The Lantern Room") without ever recording an anonymous person's
-- real name.
ALTER TABLE user_blocks ADD COLUMN IF NOT EXISTS label  text;
ALTER TABLE user_blocks ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id, blocker_id);

-- True when either of the two has blocked the other. SECURITY DEFINER so it can
-- see both directions; a caller can only ask about pairs that include themself,
-- so this cannot be used to map who blocked whom elsewhere. NULL-safe: it always
-- returns true or false, because a NULL inside a RESTRICTIVE policy would hide
-- the row.
CREATE OR REPLACE FUNCTION public.is_blocked_between(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    a IS NOT NULL AND b IS NOT NULL AND a <> b
    AND (auth.uid() IS NULL OR auth.uid() = a OR auth.uid() = b)
    AND EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = a AND ub.blocked_id = b)
         OR (ub.blocker_id = b AND ub.blocked_id = a)
    ),
    false
  );
$$;

-- ── 2. Blocked users cannot contact each other ────────────────────────────────
-- BEFORE triggers rather than edits to existing policies: they sit on top of
-- whatever the policies already allow and cannot widen access. The error text is
-- deliberately vague so a blocked person is not told they were blocked.

CREATE OR REPLACE FUNCTION public.reject_blocked_we_met()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = NEW.initiator_id AND ub.blocked_id = NEW.recipient_id)
       OR (ub.blocker_id = NEW.recipient_id AND ub.blocked_id = NEW.initiator_id)
  ) THEN
    RAISE EXCEPTION 'This request could not be sent.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_we_met_reject_blocked ON we_met;
CREATE TRIGGER trg_we_met_reject_blocked BEFORE INSERT ON we_met
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_we_met();

-- A request that was already pending when someone blocked cannot be confirmed.
DROP TRIGGER IF EXISTS trg_we_met_reject_blocked_confirm ON we_met;
CREATE TRIGGER trg_we_met_reject_blocked_confirm BEFORE UPDATE OF status ON we_met
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION public.reject_blocked_we_met();

CREATE OR REPLACE FUNCTION public.reject_blocked_dm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = NEW.sender_id AND ub.blocked_id = NEW.recipient_id)
       OR (ub.blocker_id = NEW.recipient_id AND ub.blocked_id = NEW.sender_id)
  ) THEN
    RAISE EXCEPTION 'This message could not be sent.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dm_reject_blocked ON direct_messages;
CREATE TRIGGER trg_dm_reject_blocked BEFORE INSERT ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_dm();

-- Board responses. The name sorts AFTER trg_board_response_fill, which is the
-- trigger that resolves owner_id from the pin; BEFORE triggers fire in name
-- order, so owner_id is populated by the time this runs.
CREATE OR REPLACE FUNCTION public.reject_blocked_board_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = NEW.responder_id AND ub.blocked_id = NEW.owner_id)
       OR (ub.blocker_id = NEW.owner_id     AND ub.blocked_id = NEW.responder_id)
  ) THEN
    RAISE EXCEPTION 'This response could not be sent.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_board_response_reject_blocked ON board_responses;
CREATE TRIGGER trg_board_response_reject_blocked BEFORE INSERT ON board_responses
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_board_response();

CREATE OR REPLACE FUNCTION public.reject_blocked_board_response_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_responder uuid;
  v_owner     uuid;
  v_other     uuid;
BEGIN
  SELECT r.responder_id, r.owner_id INTO v_responder, v_owner
  FROM board_responses r WHERE r.id = NEW.response_id;

  v_other := CASE WHEN NEW.sender_id = v_responder THEN v_owner ELSE v_responder END;

  IF v_other IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = NEW.sender_id AND ub.blocked_id = v_other)
       OR (ub.blocker_id = v_other       AND ub.blocked_id = NEW.sender_id)
  ) THEN
    RAISE EXCEPTION 'This message could not be sent.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_board_response_message_reject_blocked ON board_response_messages;
CREATE TRIGGER trg_board_response_message_reject_blocked BEFORE INSERT ON board_response_messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_board_response_message();

-- ── 3. Blocked users disappear from each other's feeds ────────────────────────
-- RESTRICTIVE policies are AND-ed with every existing permissive policy, so this
-- needs no knowledge of (and cannot loosen) the current SELECT rules. Realtime
-- evaluates the same policies per subscriber, so live inserts are filtered too.

DROP POLICY IF EXISTS "Blocked users are hidden" ON pulse_posts;
CREATE POLICY "Blocked users are hidden" ON pulse_posts
  AS RESTRICTIVE FOR SELECT
  USING (NOT public.is_blocked_between(auth.uid(), user_id));

DROP POLICY IF EXISTS "Blocked users are hidden" ON venue_chat;
CREATE POLICY "Blocked users are hidden" ON venue_chat
  AS RESTRICTIVE FOR SELECT
  USING (NOT public.is_blocked_between(auth.uid(), user_id));

DROP POLICY IF EXISTS "Blocked users are hidden" ON direct_messages;
CREATE POLICY "Blocked users are hidden" ON direct_messages
  AS RESTRICTIVE FOR SELECT
  USING (
    NOT public.is_blocked_between(auth.uid(), sender_id)
    AND NOT public.is_blocked_between(auth.uid(), recipient_id)
  );

DROP POLICY IF EXISTS "Blocked users are hidden" ON we_met;
CREATE POLICY "Blocked users are hidden" ON we_met
  AS RESTRICTIVE FOR SELECT
  USING (
    NOT public.is_blocked_between(auth.uid(), initiator_id)
    AND NOT public.is_blocked_between(auth.uid(), recipient_id)
  );

-- ── 4. The Board: block and report without unmasking anyone ───────────────────

-- Block whoever posted a pin. Works on anonymous pins: the caller never learns
-- who it was, only that the block landed. Requires the same Board access as
-- reading the pin in the first place.
CREATE OR REPLACE FUNCTION public.board_block_pin_author(p_pin uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_zone   uuid;
  v_author uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT p.zone_id, p.user_id INTO v_zone, v_author FROM board_pins p WHERE p.id = p_pin;
  IF v_author IS NULL OR v_author = auth.uid() THEN RETURN; END IF;
  IF NOT board_can_access(v_zone, auth.uid()) THEN RETURN; END IF;

  INSERT INTO user_blocks (blocker_id, blocked_id, label, source)
  VALUES (auth.uid(), v_author, 'Board poster', 'board')
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
END $$;

-- Block the other person in a Board response thread, and close the thread.
CREATE OR REPLACE FUNCTION public.board_block_response_other(p_response uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_responder uuid;
  v_owner     uuid;
  v_other     uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT r.responder_id, r.owner_id INTO v_responder, v_owner
  FROM board_responses r WHERE r.id = p_response;
  IF v_responder IS NULL THEN RETURN; END IF;
  IF auth.uid() NOT IN (v_responder, v_owner) THEN RETURN; END IF;

  v_other := CASE WHEN auth.uid() = v_responder THEN v_owner ELSE v_responder END;
  IF v_other IS NULL OR v_other = auth.uid() THEN RETURN; END IF;

  INSERT INTO user_blocks (blocker_id, blocked_id, label, source)
  VALUES (auth.uid(), v_other, 'Board response user', 'board_response')
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  DELETE FROM board_responses WHERE id = p_response;
END $$;

-- Report the other person in a Board response thread. Goes into the same
-- safety_reports queue admins already review. The recent messages are copied
-- into the note so the evidence survives even if the thread is later deleted.
CREATE OR REPLACE FUNCTION public.board_report_response(
  p_response uuid,
  p_reason   text DEFAULT 'other'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_responder uuid;
  v_owner     uuid;
  v_zone      uuid;
  v_other     uuid;
  v_reason    text;
  v_evidence  text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT r.responder_id, r.owner_id, r.zone_id INTO v_responder, v_owner, v_zone
  FROM board_responses r WHERE r.id = p_response;
  IF v_responder IS NULL THEN RETURN; END IF;
  IF auth.uid() NOT IN (v_responder, v_owner) THEN RETURN; END IF;

  v_other := CASE WHEN auth.uid() = v_responder THEN v_owner ELSE v_responder END;
  IF v_other IS NULL OR v_other = auth.uid() THEN RETURN; END IF;

  v_reason := CASE WHEN p_reason IN ('harassment','inappropriate_behavior','spam','fake_account','other')
                   THEN p_reason ELSE 'other' END;

  SELECT string_agg(left(m.content, 300), ' | ' ORDER BY m.created_at DESC) INTO v_evidence
  FROM (
    SELECT content, created_at FROM board_response_messages
    WHERE response_id = p_response AND sender_id = v_other
    ORDER BY created_at DESC LIMIT 5
  ) m;

  INSERT INTO safety_reports (reporter_id, reported_id, zone_id, reason, note)
  VALUES (
    auth.uid(), v_other, v_zone, v_reason,
    'Reported from a Board response thread. Their last messages: ' || COALESCE(v_evidence, '(none)')
  );
END $$;

-- ── 5. Board feed: honor blocks, and hide pins the viewer has reported ────────
-- Same function as jacob_the_board.sql with two extra conditions. Anonymous
-- pins from a blocked person drop out even though the client never sees an id.
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
    AND NOT public.is_blocked_between(auth.uid(), p.user_id)
    AND NOT EXISTS (SELECT 1 FROM board_pin_reports rp
                    WHERE rp.pin_id = p.id AND rp.reporter_id = auth.uid())
    AND (
      p.status IN ('active','complete')
      OR (p.status = 'hidden' AND (
            p.user_id = auth.uid()
            OR EXISTS (SELECT 1 FROM zones z WHERE z.id = zone_uuid AND z.owner_id = auth.uid())))
    )
  ORDER BY p.is_pinned DESC, p.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Response inbox: drop threads with someone you have blocked (or who blocked you).
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
      WHEN r.owner_id = auth.uid() THEN pr_resp.display_name
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
    AND NOT public.is_blocked_between(
          auth.uid(),
          CASE WHEN r.owner_id = auth.uid() THEN r.responder_id ELSE r.owner_id END)
  ORDER BY r.last_message_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 6. Reporting the same content twice no longer errors ──────────────────────
-- content_reports has UNIQUE (reporter_id, content_type, content_id), and the
-- original function inserted with no conflict handling, so a second tap on the
-- same message raised a unique violation and the user saw "Could not submit
-- report". Same behavior otherwise.
CREATE OR REPLACE FUNCTION report_content_auto_hide(
  p_content_type text,
  p_content_id   uuid,
  p_zone_id      uuid,
  p_reason       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  INSERT INTO content_reports (reporter_id, zone_id, content_type, content_id, reason)
  VALUES (auth.uid(), p_zone_id, p_content_type, p_content_id, p_reason)
  ON CONFLICT (reporter_id, content_type, content_id) DO NOTHING;

  IF p_content_type = 'pulse_post' THEN
    UPDATE pulse_posts SET is_hidden = true WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_message' THEN
    UPDATE venue_chat  SET is_hidden = true WHERE id = p_content_id;
  END IF;
END $$;

-- ── 7. An alarm behind the 24-hour promise ────────────────────────────────────
-- Every new report drops an in-app notification on every admin account. The
-- failure path swallows errors on purpose: a broken alert must never stop a
-- user's report from being saved.
CREATE OR REPLACE FUNCTION public.notify_admins_of_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text := COALESCE(TG_ARGV[0], 'item');
BEGIN
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT p.id, 'moderation_report', 'New report to review',
         'A ' || v_kind || ' was reported. Reports are reviewed within 24 hours.',
         jsonb_build_object('kind', v_kind, 'report_id', NEW.id)
  FROM profiles p
  WHERE p.is_admin = true;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_safety_report ON safety_reports;
CREATE TRIGGER trg_notify_admins_safety_report AFTER INSERT ON safety_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_of_report('user');

DROP TRIGGER IF EXISTS trg_notify_admins_content_report ON content_reports;
CREATE TRIGGER trg_notify_admins_content_report AFTER INSERT ON content_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_of_report('post or message');

DROP TRIGGER IF EXISTS trg_notify_admins_board_report ON board_pin_reports;
CREATE TRIGGER trg_notify_admins_board_report AFTER INSERT ON board_pin_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_of_report('Board pin');

-- ── Verify ────────────────────────────────────────────────────────────────────
--   SELECT polname, polpermissive FROM pg_policy
--   WHERE polname = 'Blocked users are hidden';             -- 4 rows, polpermissive = false
--   SELECT tgname FROM pg_trigger
--   WHERE tgname LIKE '%reject_blocked%' AND NOT tgisinternal;   -- 5 rows
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('is_blocked_between','board_block_pin_author','board_block_response_other',
--      'board_report_response','notify_admins_of_report');  -- 5 rows
