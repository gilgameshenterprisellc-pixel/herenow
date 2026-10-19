-- A live contest on the App Review demo venue (Oct 2026). Run once, after
-- live_contests.sql and apple_demo_account.sql. Safe to re-run.
--
-- App Review has to be able to reach the contest screens, so the reviewer
-- needs a contest that is live with signups open at the venue the demo
-- account checks into: The Lantern Room (the seeded demo zone, renamed from
-- "HereNow Demo (Apple Park)"; see apple_demo_account.sql). The demo account
-- is also made an operator, so the reviewer can see the console that runs it.
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

-- Found by email, the same way apple_demo_account.sql finds it.
INSERT INTO contest_operators (contest_id, user_id)
SELECT c.id, p.id
FROM contests c
JOIN zones z ON z.id = c.zone_id AND z.name = 'The Lantern Room'
JOIN auth.users u ON u.email = 'herenowdemo@gmail.com'
JOIN profiles p ON p.id = u.id
WHERE c.title = 'Mechanical Bull Showdown'
ON CONFLICT (contest_id, user_id) DO NOTHING;

-- Check it worked: one row, live, signups open, approved.
SELECT c.title, c.status, c.signups_open, c.venue_approved,
       (SELECT count(*) FROM contest_operators o WHERE o.contest_id = c.id) AS operators
FROM contests c JOIN zones z ON z.id = c.zone_id
WHERE z.name = 'The Lantern Room';

-- ── App Review notes (add to Review Information with the build) ───────────────
-- Live contests: a venue (or a brand it approves) can run a contest such as a
-- mechanical bull night. People checked in at the venue sign up in the app and
-- watch a live leaderboard; the host runs it from an operator screen.
--   1. Sign in with the demo account and check in at The Lantern Room.
--   2. On the venue page, tap the "Mechanical Bull Showdown" card at the top.
--   3. Tap "Sign me up". You join the line and appear on the leaderboard after
--      a score is recorded.
--   4. The demo account is also an operator: tap "Run contest" to call people
--      up and record scores.
--   5. "Official rules" on the contest screen shows the rules and states that
--      Apple is not a sponsor of the contest and is not involved with it.
-- Contests are free to enter and have no in-app purchases.
