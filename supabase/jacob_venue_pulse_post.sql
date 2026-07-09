-- Venue owners posting to their Pulse from the dashboard (Jacob #3). Run once.
--
-- Guest Pulse posts require an active check-in session. A venue owner isn't a
-- checked-in person, so they had no way to post to their own Pulse. Allow an
-- owner to insert a venue Pulse post with no session, gated to the zone they own.

-- 1. Session becomes optional (venue posts have no person-session).
ALTER TABLE pulse_posts ALTER COLUMN session_id DROP NOT NULL;

-- 2. Zone owner can post a venue Pulse post (no session, is_venue_post = true).
DROP POLICY IF EXISTS "Venue owner posts to their Pulse" ON pulse_posts;
CREATE POLICY "Venue owner posts to their Pulse"
  ON pulse_posts FOR INSERT
  WITH CHECK (
    is_venue_post = true
    AND session_id IS NULL
    AND user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM zones WHERE id = pulse_posts.zone_id AND owner_id = auth.uid())
  );

-- 3. Zone owner can pin/unpin + delete their own venue posts.
DROP POLICY IF EXISTS "Venue owner manages venue posts" ON pulse_posts;
CREATE POLICY "Venue owner manages venue posts"
  ON pulse_posts FOR UPDATE
  USING (is_venue_post = true AND EXISTS (SELECT 1 FROM zones WHERE id = pulse_posts.zone_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Venue owner deletes venue posts" ON pulse_posts;
CREATE POLICY "Venue owner deletes venue posts"
  ON pulse_posts FOR DELETE
  USING (is_venue_post = true AND EXISTS (SELECT 1 FROM zones WHERE id = pulse_posts.zone_id AND owner_id = auth.uid()));
