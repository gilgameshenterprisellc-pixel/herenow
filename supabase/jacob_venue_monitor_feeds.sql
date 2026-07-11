-- Let a venue owner READ their zone's Pulse + Chat to monitor them (Jacob build 8).
-- Run once in Supabase.
--
-- The existing SELECT policies require being a checked-in zone member, and the
-- venue owner is deliberately hidden / not checked in, so they couldn't see the
-- feeds they can post to. These additive owner-read policies fix that. RLS
-- policies are OR'd, so this only grants; it takes nothing away.

DROP POLICY IF EXISTS "Venue owner sees their zone pulse" ON pulse_posts;
CREATE POLICY "Venue owner sees their zone pulse"
  ON pulse_posts FOR SELECT
  USING (EXISTS (SELECT 1 FROM zones WHERE id = pulse_posts.zone_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Venue owner sees their zone chat" ON venue_chat;
CREATE POLICY "Venue owner sees their zone chat"
  ON venue_chat FOR SELECT
  USING (EXISTS (SELECT 1 FROM zones WHERE id = venue_chat.zone_id AND owner_id = auth.uid()));
