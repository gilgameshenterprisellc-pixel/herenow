-- The whole profiles table is readable by anyone, unauthenticated.
--
-- supabase/schema.sql:24 has carried this since Phase 1:
--
--     create policy "Public profiles viewable by everyone"
--       on profiles for select using (true);
--
-- `using (true)` with no role restriction means the anon role can read every
-- row and every column. The anon key is not a secret -- it is inlined into the
-- JS bundle served at herenow-pi.vercel.app, so anyone who opens devtools has
-- it. Verified against production with nothing but that key and no login:
--
--     21 profiles          display names, bios, age ranges, interests, kickoffs
--     11 phone numbers     E.164, from jacob_phone_registration.sql
--      2 email addresses
--      9 push tokens       live ExponentPushToken[...] values
--     21 is_admin flags    tells an attacker which accounts are worth attacking
--
-- The push tokens are the sharpest edge: Expo's push API accepts a token and a
-- message with no secret of ours, so anyone who scraped this could push
-- arbitrary notifications to those nine people.
--
-- It also quietly breaks two promises the product makes on screen. The profile
-- editor says a profile "is never searchable and disappears when your session
-- ends", and the check-in privacy switch (see
-- checkin_visibility_enforcement.sql) claims to hide interests and kickoffs.
-- Both are false while the table itself is world-readable.
--
-- This policy was written when profiles held a display name and an avatar. It
-- was never revisited as bio, age_range, interest_tags, kickoffs, phone, email,
-- push_token, is_admin and venue_status were added to the same table.

DROP POLICY IF EXISTS "Public profiles viewable by everyone" ON profiles;

CREATE POLICY "Profiles viewable by signed-in users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Deliberately still `true` for signed-in users rather than something tighter.
-- The app genuinely needs cross-user profile reads: PersonCard renders everyone
-- in the room, and lib/push.ts reads the recipient's push_token from the client
-- to send a notification. Narrowing this further requires the two changes in
-- the header comment of the follow-up below, and doing it in one step here
-- would break check-in and push.
--
-- What this does fix, completely, is unauthenticated scraping -- which is the
-- severe half, because it needs no account, leaves no trace, and the key is
-- public.

-- ── Known consequence ────────────────────────────────────────────────────────
-- app/u/[id].tsx has no auth gate, so a logged-out visitor opening a shared
-- profile link will now see an empty profile instead of that person's bio, age
-- range, interests and kickoffs. That is the correct outcome for an app whose
-- own copy promises profiles are "never searchable", but it is a behavior
-- change, not a silent one. If public profile links are wanted later, the way
-- to do it is a view exposing only the columns meant to be public, not by
-- reopening the base table.

-- ── Follow-up, not done here ─────────────────────────────────────────────────
-- Signed-in users can still read every other user's phone, email and push
-- token. Column-level REVOKE is the obvious fix and does not work as-is:
-- lib/sessions.ts does `select('*')` on profiles in two places (checkIn and
-- isDemoAccount), deliberately, so a missing is_demo column reads as undefined
-- instead of erroring. A REVOKE on any column breaks both, and with them
-- check-in.
--
-- The clean version is to move phone, email and push_token into a
-- profiles_private table whose policy is `auth.uid() = id`, and to move push
-- sending into an Edge Function that looks the token up with the service role
-- so clients never read tokens at all. That is a code change and a data
-- migration, and belongs in its own PR.
