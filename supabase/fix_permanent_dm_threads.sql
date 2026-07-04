-- Fix existing We Met threads that were permanently unlocked (mutual-reply persistence)
-- before the sentinel date was introduced. Previously, sendMessage set expires_at = null
-- for permanent threads, which collided with the "locked until checkout" null state.
-- Now permanent threads use '2099-12-31T00:00:00Z' as a sentinel.
--
-- This updates any confirmed we_met row that:
--   1. Has expires_at = null (could be locked OR already-permanent)
--   2. Has at least one message sent by each party (mutual reply = permanent)
UPDATE we_met
SET expires_at = '2099-12-31T00:00:00Z'
WHERE status = 'confirmed'
  AND expires_at IS NULL
  AND id IN (
    SELECT DISTINCT we_met_id
    FROM direct_messages dm1
    WHERE EXISTS (
      SELECT 1 FROM direct_messages dm2
      WHERE dm2.we_met_id = dm1.we_met_id
        AND dm2.sender_id != dm1.sender_id
    )
  );
