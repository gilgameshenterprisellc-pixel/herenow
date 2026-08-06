-- App Store review demo account (Aug 2026). Answers Jacob's question directly:
-- you do NOT need a real inbox. The account is created in the system and its
-- email is just a label — auto-confirm it, no verification mail is ever needed.
--
-- Pairs with the is_demo geofence bypass in lib/sessions.ts (checkIn): the demo
-- account — and ONLY it — checks in without being physically at the venue, so the
-- reviewer (in Cupertino or a simulator) can actually reach the room. It also
-- pairs with the is_demo staleness exemption in session_reconcile_and_window.sql
-- so any seeded demo people stay in the room for the whole review.

-- ── 0. Column (idempotent; also created in session_reconcile_and_window.sql) ───
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- ── 1. Create the auth user (do this in the DASHBOARD, not SQL) ───────────────
-- Supabase → Authentication → Users → "Add user":
--     Email:    herenowdemo@gmail.com
--     Password: Happytobeherenow
--     ☑ Auto Confirm User   (so no confirmation email is required)
-- Then run the rest of this file.

-- ── 2. Promote that user to a demo profile ────────────────────────────────────
INSERT INTO profiles (id, display_name, username, is_demo, is_venue_owner, venue_status)
SELECT id, 'Alex Rivera', 'herenow_demo', true, false, 'none'
FROM auth.users
WHERE email = 'herenowdemo@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET is_demo = true,
      display_name = COALESCE(profiles.display_name, 'Alex Rivera');

-- Give the demo profile a lived-in look so the reviewer's own card isn't blank.
UPDATE profiles
SET bio = COALESCE(bio, 'Checking out HereNow.'),
    interest_tags = COALESCE(NULLIF(interest_tags, '{}'), ARRAY['Music','Food','Art']),
    age_range = COALESCE(age_range, '25-34')
WHERE id = (SELECT id FROM auth.users WHERE email = 'herenowdemo@gmail.com');

-- ── 3. (Optional) Seed a couple of companions so the room isn't empty ─────────
-- profiles.id is FK'd to auth.users, so companions need real accounts. Easiest:
-- sign up two throwaway accounts in the app (any email/password), then run this
-- with their emails filled in. Marking them is_demo makes their check-ins
-- permanent (exempt from the staleness sweep) for the whole review window.
--
-- UPDATE profiles SET is_demo = true, display_name = 'Jordan P.'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'REPLACE_companion1@example.com');
-- UPDATE profiles SET is_demo = true, display_name = 'Sam T.'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'REPLACE_companion2@example.com');
--
-- INSERT INTO sessions (zone_id, user_id, social_mode, social_modes, mood_mode, is_active, is_ghost, checked_in_at, last_seen_at)
-- SELECT z.id, u.id, 'friends', ARRAY['friends'], 'open', true, false, now(), now()
-- FROM zones z, auth.users u
-- WHERE z.name = 'HereNow Demo (Apple Park)'
--   AND u.email IN ('REPLACE_companion1@example.com','REPLACE_companion2@example.com')
--   AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.is_active = true);

-- ── 4. App Review notes (paste into App Store Connect → Review Information) ────
-- Demo account: herenowdemo@gmail.com / Happytobeherenow
--
-- HereNow shows who is physically checked in at a venue right now. To review the
-- core loop:
--   1. Sign in with the demo account above.
--   2. Open the venue "HereNow Demo (Apple Park)".
--   3. Tap "Check In", pick a Social Mode + Mood, confirm. (This demo account is
--      allowed to check in without being on-site; real users must be at the
--      venue. So you can test from anywhere, including the simulator.)
--   4. You'll see the People / Pulse / Chat / Board tabs for that venue. Post to
--      Pulse or Chat, and open another person's card to send a "We Met" request.
--
-- Verify:
--   SELECT id, name FROM zones WHERE name = 'HereNow Demo (Apple Park)';
--   SELECT display_name, is_demo FROM profiles
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'herenowdemo@gmail.com');
