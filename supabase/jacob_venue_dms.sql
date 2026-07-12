-- Venue DMs (Jacob build 8). Run once.
--
-- Jacob: "allow them to DM venues without having to we met. No time limit.
-- Most people who dm a venue will be asking questions or reporting something."
--
-- Venue DMs are a SEPARATE thread type from We Met DMs so the safety-critical
-- We Met flow and its analytics are untouched. A venue thread is keyed on
-- (venue_zone_id, the two parties) and never expires.

-- 1. we_met_id becomes optional; venue DMs carry a venue_zone_id instead.
ALTER TABLE direct_messages ALTER COLUMN we_met_id DROP NOT NULL;
ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS venue_zone_id uuid REFERENCES zones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_direct_messages_venue_zone
  ON direct_messages (venue_zone_id) WHERE venue_zone_id IS NOT NULL;

-- 2. INSERT policy for venue DMs. Two allowed senders:
--    a) a follower/subscriber of the venue messaging the venue owner
--    b) the venue owner replying to a patron
-- The existing "Sender sends DM after confirmed We Met" policy is unchanged; RLS
-- policies are OR'd, so this only grants the new venue path.
DROP POLICY IF EXISTS "Venue DM insert" ON direct_messages;
CREATE POLICY "Venue DM insert"
  ON direct_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND venue_zone_id IS NOT NULL
    AND we_met_id IS NULL
    AND (
      -- (a) follower/subscriber -> owner
      (
        recipient_id = (SELECT owner_id FROM zones WHERE id = venue_zone_id)
        AND EXISTS (
          SELECT 1 FROM venue_subscriptions vs
          WHERE vs.zone_id = venue_zone_id AND vs.user_id = auth.uid()
        )
      )
      -- (b) owner -> patron
      OR auth.uid() = (SELECT owner_id FROM zones WHERE id = venue_zone_id)
    )
  );

-- SELECT ("Parties see non-expired DMs") and UPDATE ("Recipient marks DMs read")
-- already key on sender_id/recipient_id, so they cover venue DMs unchanged. Venue
-- DMs are inserted with a far-future expires_at sentinel so they never expire.
