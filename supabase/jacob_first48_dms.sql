-- First 48 DM rules (Jacob, July 7 2026) — run once in Supabase SQL editor
--
-- New model:
--   * DMs open at mutual We Met confirmation (expires_at = confirm + 48h)
--   * First message resets the window (reply within 48h)
--   * A reply from the other party makes the thread permanent (sentinel 2099-12-31)
--   * Either party can "unmeet" — deletes the we_met row, messages cascade

-- 1. Unmeet: parties may delete their own we_met rows (no DELETE policy existed)
DROP POLICY IF EXISTS "Parties can unmeet" ON we_met;
CREATE POLICY "Parties can unmeet"
  ON we_met FOR DELETE
  USING (auth.uid() = initiator_id OR auth.uid() = recipient_id);

-- 2. Permanence RPC: sets the thread sentinel AND backfills message rows so
--    messages in permanent threads never disappear behind their own 72h RLS expiry.
CREATE OR REPLACE FUNCTION make_thread_permanent(p_we_met_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM we_met
    WHERE id = p_we_met_id
      AND (initiator_id = auth.uid() OR recipient_id = auth.uid())
  ) THEN
    RETURN;
  END IF;

  UPDATE we_met
  SET expires_at = '2099-12-31T00:00:00Z'
  WHERE id = p_we_met_id;

  UPDATE direct_messages
  SET expires_at = '2099-12-31T00:00:00Z'
  WHERE we_met_id = p_we_met_id;
END $$;

-- 3. Backfill: legacy "locked until checkout" threads (expires_at NULL) get a
--    fresh 48h first-move window under the new rules.
UPDATE we_met
SET expires_at = now() + INTERVAL '48 hours'
WHERE status = 'confirmed'
  AND expires_at IS NULL;

-- 4. Backfill: message rows inside already-permanent threads get the sentinel too
--    (they were silently expiring at 72h even though the thread was permanent).
UPDATE direct_messages
SET expires_at = '2099-12-31T00:00:00Z'
WHERE we_met_id IN (
  SELECT id FROM we_met WHERE expires_at >= '2099-01-01T00:00:00Z'
);
