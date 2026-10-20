-- A live contest on the App Review demo venue (Oct 2026). Run once, after
-- live_contests.sql and apple_demo_account.sql. Safe to re-run.
--
-- App Review has to be able to reach the contest screens, so the reviewer
-- needs a contest that is live with signups open at the venue the demo
-- account checks into: The Lantern Room (the seeded demo zone, renamed from
-- "HereNow Demo (Apple Park)"; see apple_demo_account.sql). A few demo
-- companions already have scores, so the reviewer lands on a real leaderboard.
-- The review account is an ordinary entrant, not an operator: an operator
-- can't score their own turn, and a regular person never sees the console.
--
-- Runs in the SQL editor as the database owner, which is why it can insert
-- directly; the app itself only ever goes through the contest_* functions.

INSERT INTO contests (
  zone_id, created_by, title, tagline, accent_color,
  score_label, score_suffix, score_decimals, higher_wins, attempts_per_entry,
  rules, status, signups_open, venue_approved
)
SELECT
  z.id, z.owner_id,
  'Mechanical Bull Showdown',
  'Longest ride of the night takes the crown',
  '#F5B700',
  'Time', 's', 2, true, 1,
  'Sign up while checked in at the venue. The host calls riders up in the order they signed up and times each ride; the longest ride wins. Riders must sign the venue''s waiver before riding. The host may skip anyone not present when called and may remove anyone at their discretion.',
  'live', true, true
FROM zones z
WHERE z.name = 'The Lantern Room'
  AND NOT EXISTS (
    SELECT 1 FROM contests c WHERE c.zone_id = z.id AND c.title = 'Mechanical Bull Showdown'
  );

-- Re-running this before a submission puts the contest back where a reviewer
-- needs it: live, signups open, approved, not hidden.
UPDATE contests c SET status = 'live', signups_open = true, venue_approved = true,
       ended_at = NULL, version = version + 1, updated_at = now()
FROM zones z
WHERE z.id = c.zone_id AND z.name = 'The Lantern Room' AND c.title = 'Mechanical Bull Showdown'
  AND (c.status <> 'live' OR NOT c.signups_open OR NOT c.venue_approved);

-- The review account used to be an operator here. It's an entrant now.
DELETE FROM contest_operators o
USING contests c, zones z, auth.users u
WHERE o.contest_id = c.id AND z.id = c.zone_id AND z.name = 'The Lantern Room'
  AND c.title = 'Mechanical Bull Showdown'
  AND u.email = 'herenowdemo@gmail.com' AND o.user_id = u.id;

-- Three demo companions (is_demo profiles other than the review account, the
-- same people apple_demo_safety_content.sql uses) with finished rides.
DO $$
DECLARE
  v_contest uuid;
  v_demo    uuid;
  v_scores  numeric[] := ARRAY[9.84, 7.31, 5.02];
  v_p       record;
  v_i       int := 0;
  v_entry   uuid;
BEGIN
  SELECT c.id INTO v_contest FROM contests c JOIN zones z ON z.id = c.zone_id
  WHERE z.name = 'The Lantern Room' AND c.title = 'Mechanical Bull Showdown' LIMIT 1;
  SELECT id INTO v_demo FROM auth.users WHERE email = 'herenowdemo@gmail.com';
  IF v_contest IS NULL THEN RAISE NOTICE 'No demo contest yet.'; RETURN; END IF;

  FOR v_p IN
    SELECT id, display_name FROM profiles
    WHERE is_demo = true AND id IS DISTINCT FROM v_demo
    ORDER BY created_at, id LIMIT 3
  LOOP
    v_i := v_i + 1;
    CONTINUE WHEN EXISTS (SELECT 1 FROM contest_entries WHERE contest_id = v_contest AND user_id = v_p.id);
    INSERT INTO contest_entries (contest_id, user_id, display_name, status, queue_no,
                                 attempts_used, best_score, best_at, joined_at)
    VALUES (v_contest, v_p.id, contest_public_name(v_p.display_name), 'done', v_i,
            1, v_scores[v_i], now() - make_interval(mins => 40 - v_i * 10), now() - INTERVAL '1 hour')
    RETURNING id INTO v_entry;
    INSERT INTO contest_attempts (contest_id, entry_id, score, created_at)
    VALUES (v_contest, v_entry, v_scores[v_i], now() - make_interval(mins => 40 - v_i * 10));
  END LOOP;

  PERFORM contest_recount(v_contest);
  PERFORM contest_touch(v_contest);
END $$;

-- Check it worked: one row, live, signups open, approved, scores on the board,
-- and the review account not an operator.
SELECT c.title, c.status, c.signups_open, c.venue_approved, c.entry_count,
       (SELECT count(*) FROM contest_attempts a WHERE a.contest_id = c.id AND NOT a.voided) AS scores,
       EXISTS (SELECT 1 FROM contest_operators o JOIN auth.users u ON u.id = o.user_id
               WHERE o.contest_id = c.id AND u.email = 'herenowdemo@gmail.com') AS review_account_is_operator
FROM contests c JOIN zones z ON z.id = c.zone_id
WHERE z.name = 'The Lantern Room' AND c.title = 'Mechanical Bull Showdown';

-- ── App Review notes (add to Review Information with the build) ───────────────
-- Live contests: a venue (or a brand it approves) can run a contest such as a
-- mechanical bull night. People checked in at the venue sign up in the app and
-- watch a live leaderboard; the host runs it from an operator screen.
--   1. Sign in with the demo account and check in at The Lantern Room.
--   2. On the venue page, tap the "Mechanical Bull Showdown" card at the top.
--   3. The leaderboard already shows three riders. Tap "Sign me up": you join
--      the line ("You're next"). The venue's staff call people up and record
--      scores from an operator screen that regular users don't see.
--   4. "Official rules" on the contest screen shows the rules and states that
--      Apple is not a sponsor of the contest and is not involved with it.
-- Contests are free to enter and have no in-app purchases.
