-- In-app account deletion. Run once.
--
-- Apple App Store Review Guideline 5.1.1(v): an app that lets you create an
-- account must let you delete it FROM INSIDE THE APP. Directing people to email
-- support is called out explicitly as not sufficient, and it is a routine
-- rejection. Settings previously offered "Delete Account", signed the user out,
-- and asked them to email support@herenowsocial.com — so nothing was deleted.
--
-- Why every table is listed out rather than leaning on ON DELETE CASCADE from
-- auth.users: only nine foreign keys in this whole schema actually declare a
-- cascade, and roughly forty tables carry a user column. Most of those columns
-- were added by later migrations without a declared FK at all. Deleting the auth
-- row and trusting the graph would leave most of a person's data sitting in the
-- database. Explicit deletes make the outcome independent of how any given FK
-- happens to be configured; where a cascade does exist, the explicit delete
-- simply finds nothing left to do.
--
-- Child rows are deleted before their parents so an intact FK cannot abort the
-- transaction. The whole function is one statement to Postgres, so any failure
-- rolls the entire thing back — an account is never half-deleted.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinning search_path stops a caller-controlled path from resolving these table
-- names to something else inside a SECURITY DEFINER function.
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- ── Board: messages → responses → pin children → pins ────────────────────
  DELETE FROM board_response_messages WHERE sender_id = uid;
  DELETE FROM board_responses         WHERE responder_id = uid OR owner_id = uid;
  DELETE FROM board_pin_likes         WHERE user_id = uid;
  DELETE FROM board_pin_saves         WHERE user_id = uid;
  DELETE FROM board_pin_reports       WHERE reporter_id = uid;
  DELETE FROM board_pins              WHERE user_id = uid;
  DELETE FROM board_bans              WHERE user_id = uid;
  DELETE FROM board_contact_shares    WHERE user_id = uid;

  -- ── Connections: DMs hang off We Met, so they go first ───────────────────
  DELETE FROM direct_messages WHERE sender_id = uid OR recipient_id = uid;
  DELETE FROM we_met          WHERE initiator_id = uid OR recipient_id = uid;
  DELETE FROM circle_requests WHERE requester_id = uid OR recipient_id = uid;
  DELETE FROM user_blocks     WHERE blocker_id = uid OR blocked_id = uid;

  -- ── Posts and their children ─────────────────────────────────────────────
  DELETE FROM post_likes      WHERE user_id = uid;
  DELETE FROM post_comments   WHERE user_id = uid;
  DELETE FROM zone_posts      WHERE user_id = uid;
  DELETE FROM pulse_reactions WHERE user_id = uid;
  DELETE FROM pulse_posts     WHERE user_id = uid;
  DELETE FROM venue_chat      WHERE user_id = uid;

  -- ── Presence: afterglow recaps reference the session that produced them ──
  DELETE FROM afterglow    WHERE user_id = uid;
  DELETE FROM event_rsvps  WHERE user_id = uid;
  DELETE FROM sessions     WHERE user_id = uid;
  DELETE FROM zone_members WHERE user_id = uid;

  -- ── Everything else keyed to the person ──────────────────────────────────
  DELETE FROM notifications         WHERE user_id = uid;
  DELETE FROM user_badges           WHERE user_id = uid;
  DELETE FROM venue_subscriptions   WHERE user_id = uid;
  DELETE FROM promo_views           WHERE user_id = uid;
  DELETE FROM promotion_redemptions WHERE user_id = uid;
  DELETE FROM organization_members  WHERE user_id = uid;
  DELETE FROM app_events            WHERE user_id = uid;

  -- Reports: both sides. A report someone filed ABOUT this account goes too —
  -- once the account is gone the report names nobody, and keeping it would
  -- retain data about a deleted person.
  DELETE FROM safety_reports  WHERE reporter_id = uid OR reported_id = uid;
  DELETE FROM content_reports WHERE reporter_id = uid;

  -- ── Venue-side content this account authored ─────────────────────────────
  DELETE FROM venue_announcements WHERE created_by = uid;
  DELETE FROM venue_promotions    WHERE created_by = uid;
  DELETE FROM venue_highlights    WHERE created_by = uid;
  DELETE FROM venue_photos        WHERE created_by = uid;
  DELETE FROM venue_events        WHERE created_by = uid;
  DELETE FROM venue_submissions   WHERE submitted_by = uid;

  -- Organizations and venues this account owns go with it. A venue account IS
  -- the business's account here, so "delete my account" has to take the venue —
  -- leaving it behind would strand a listing nobody can administer, pointing at
  -- an owner_id that no longer resolves. The confirmation dialog in the app
  -- spells this out before anyone gets here.
  DELETE FROM organizations WHERE owner_id = uid;
  DELETE FROM zones         WHERE owner_id = uid;

  -- ── The person ───────────────────────────────────────────────────────────
  DELETE FROM profiles   WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Only a signed-in caller, and only ever their own account: the function reads
-- auth.uid() itself and takes no arguments, so there is no id to tamper with.
REVOKE ALL   ON FUNCTION public.delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
