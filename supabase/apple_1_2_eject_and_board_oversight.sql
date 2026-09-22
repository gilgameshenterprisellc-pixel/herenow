-- Apple Guideline 1.2 (Safety — User Generated Content), rejection Sept 22 2026
-- on submission ff4c2ff2. Apple's ask, verbatim: a method to filter objectionable
-- content, a mechanism to flag it, a mechanism to block abusive users, a
-- mechanism to immediately remove posts, and — the actual gap — "act on
-- objectionable content reports within 24 hours by removing the content and
-- ejecting the user who provided the offending content."
--
-- Everything except "eject the user" already existed: screenText() filters
-- pulse/chat/Board, report-and-auto-hide exists for all three, block exists,
-- posters can remove their own content immediately. What did NOT exist: any
-- way to remove a user from the platform. The only punitive tool was mute
-- (profiles.is_muted), and auditing it while building this turned up a second,
-- unrelated bug — that flag has been dead since it was built. admin_set_user_
-- muted() has set it since #189, admin/users.tsx and admin/reports.tsx have
-- offered a Mute button since the same batch, and nothing anywhere ever reads
-- profiles.is_muted. Only the separate, venue-scoped venue_muted_users table
-- (the "time someone out for the night" feature) was ever enforced. The global
-- Mute button has been a no-op since the day it shipped. Fixed here as the
-- same change, since it's the same trigger.
--
-- Also fixed: the Board is the one surface in the app that's genuinely
-- anonymous (board_pins has no client SELECT policy at all — see
-- jacob_the_board.sql), and it's the one surface with zero admin oversight.
-- admin/reports.tsx only ever queried content_reports (pulse/chat) and
-- safety_reports (users); board_pin_reports was invisible to review. Given
-- Apple's rejection literally says "posts content anonymously," that's almost
-- certainly the reviewer's example. Fixed with an admin-only RPC that unmasks
-- authorship for review (never for anyone else) and surfaces reported/hidden
-- pins in the same queue.

-- ── 1. Eject: a real, platform-wide account suspension ───────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned  BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at  TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;

CREATE OR REPLACE FUNCTION admin_set_user_banned(
  p_user_id uuid,
  p_banned  boolean,
  p_reason  text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles
  SET is_banned  = p_banned,
      banned_at  = CASE WHEN p_banned THEN now() ELSE NULL END,
      ban_reason = CASE WHEN p_banned THEN p_reason ELSE NULL END
  WHERE id = p_user_id;
END;
$$;

-- ── 2. Enforce is_banned AND (finally) is_muted at the database, not just UI ──
-- Extends the existing venue-timeout trigger (jacob_venue_mute.sql) rather than
-- replacing it — venue_muted_users (the per-room, per-night timeout) still
-- applies exactly as before. This adds the two account-level flags on top.
CREATE OR REPLACE FUNCTION public.reject_muted_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_banned boolean;
  v_muted  boolean;
BEGIN
  SELECT is_banned, is_muted INTO v_banned, v_muted FROM profiles WHERE id = NEW.user_id;

  IF v_banned THEN
    RAISE EXCEPTION 'Your account has been suspended.';
  END IF;

  IF v_muted THEN
    RAISE EXCEPTION 'Your account has been muted.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM venue_muted_users m
    WHERE m.zone_id = NEW.zone_id
      AND m.user_id = NEW.user_id
      AND (m.muted_until IS NULL OR m.muted_until > now())
  ) THEN
    RAISE EXCEPTION 'You have been muted in this room by the venue.';
  END IF;

  RETURN NEW;
END;
$$;

-- Already attached to venue_chat + pulse_posts (jacob_venue_mute.sql). Add the
-- Board — its INSERT policy never checked mute OR ban before this.
DROP TRIGGER IF EXISTS trg_reject_muted_board_pins ON board_pins;
CREATE TRIGGER trg_reject_muted_board_pins BEFORE INSERT ON board_pins
  FOR EACH ROW EXECUTE FUNCTION public.reject_muted_post();

-- board_response_messages has no zone_id (Responses aren't venue-scoped), so it
-- can't use venue_muted_users — but it needs the same account-level gate.
CREATE OR REPLACE FUNCTION public.reject_banned_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_banned boolean;
  v_muted  boolean;
BEGIN
  SELECT is_banned, is_muted INTO v_banned, v_muted FROM profiles WHERE id = NEW.sender_id;

  IF v_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF v_muted  THEN RAISE EXCEPTION 'Your account has been muted.';     END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_banned_board_response ON board_response_messages;
CREATE TRIGGER trg_reject_banned_board_response BEFORE INSERT ON board_response_messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_banned_response();

-- ── 3. Admin oversight of the Board — the anonymous surface Apple flagged ────
-- Unmasks authorship for admin review only (board_pins has no SELECT policy at
-- all — every other read goes through the masking RPCs in jacob_the_board.sql).
-- Fails closed: a non-admin caller gets zero rows, not an error.
CREATE OR REPLACE FUNCTION admin_board_reported_pins()
RETURNS TABLE (
  id            uuid,
  zone_id       uuid,
  zone_name     text,
  category      text,
  title         text,
  body          text,
  image_url     text,
  is_anonymous  boolean,
  status        text,
  report_count  int,
  created_at    timestamptz,
  author_id     uuid,
  author_name   text,
  author_banned boolean
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, p.zone_id, z.name, p.category, p.title, p.body, p.image_url,
    p.is_anonymous, p.status, p.report_count, p.created_at,
    p.user_id, pr.display_name, pr.is_banned
  FROM board_pins p
  JOIN zones z    ON z.id  = p.zone_id
  JOIN profiles pr ON pr.id = p.user_id
  WHERE EXISTS (SELECT 1 FROM profiles a WHERE a.id = auth.uid() AND a.is_admin = true)
    AND (p.status = 'hidden' OR p.report_count > 0)
  ORDER BY p.report_count DESC, p.created_at DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION admin_set_board_pin_status(
  p_pin    uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;
  IF p_status NOT IN ('active', 'hidden', 'removed') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  UPDATE board_pins SET status = p_status, updated_at = now() WHERE id = p_pin;
END;
$$;
