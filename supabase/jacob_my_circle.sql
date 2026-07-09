-- My Circle (Jacob, July 8 2026). Run once in Supabase.
--
-- We Met = you met in person (unlocks DMs). My Circle = a deliberate, mutual,
-- private list of people you've chosen to keep. Progression:
--   Strangers -> We Met -> DMs -> My Circle
-- A We Met never auto-becomes a Circle connection — it must be requested and
-- accepted by both. Only you can see your own Circle (no public friends list).

CREATE TABLE IF NOT EXISTS circle_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending',   -- pending | accepted | declined
  created_at   timestamptz DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (requester_id, recipient_id)
);

ALTER TABLE circle_requests ENABLE ROW LEVEL SECURITY;

-- Both parties can see a request that involves them.
DROP POLICY IF EXISTS "Parties see their circle requests" ON circle_requests;
CREATE POLICY "Parties see their circle requests"
  ON circle_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- You can only request someone you've actually met (confirmed We Met).
DROP POLICY IF EXISTS "Request circle after We Met" ON circle_requests;
CREATE POLICY "Request circle after We Met"
  ON circle_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> recipient_id
    AND EXISTS (
      SELECT 1 FROM we_met w
      WHERE w.status = 'confirmed'
        AND ((w.initiator_id = requester_id AND w.recipient_id = recipient_id)
          OR (w.initiator_id = recipient_id AND w.recipient_id = requester_id))
    )
  );

-- The recipient can accept/decline.
DROP POLICY IF EXISTS "Recipient responds to circle request" ON circle_requests;
CREATE POLICY "Recipient responds to circle request"
  ON circle_requests FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Either party can remove the row (cancel a pending request, or leave the circle).
DROP POLICY IF EXISTS "Either party removes circle link" ON circle_requests;
CREATE POLICY "Either party removes circle link"
  ON circle_requests FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE INDEX IF NOT EXISTS circle_requests_recipient_idx ON circle_requests (recipient_id, status);
CREATE INDEX IF NOT EXISTS circle_requests_requester_idx ON circle_requests (requester_id, status);
