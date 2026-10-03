-- Apple compliance audit, Oct 3 2026. Run once in the Supabase SQL editor.
-- Idempotent: safe to run twice.
--
-- A blocked person (either direction) can no longer send a My Circle request.
-- The earlier block work covered We Met, direct messages, Board responses and the
-- Pulse/Chat/People feeds, but circle_requests was missed: someone you blocked
-- after meeting could still send you a Circle request, and it would land in your
-- notifications. The error text is deliberately vague so the blocked person is not
-- told they were blocked.

CREATE OR REPLACE FUNCTION public.reject_blocked_circle_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = NEW.requester_id AND ub.blocked_id = NEW.recipient_id)
       OR (ub.blocker_id = NEW.recipient_id AND ub.blocked_id = NEW.requester_id)
  ) THEN
    RAISE EXCEPTION 'This request could not be sent.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_circle_request_reject_blocked ON circle_requests;
CREATE TRIGGER trg_circle_request_reject_blocked BEFORE INSERT ON circle_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_circle_request();

-- Verify (expect 1):
--   SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_circle_request_reject_blocked' AND NOT tgisinternal;
