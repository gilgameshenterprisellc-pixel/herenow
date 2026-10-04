-- Remove anonymous posting (Apple Guideline 1.2, Oct 3 2026). Run once in the
-- Supabase SQL editor. Idempotent: safe to run twice.
--
-- Apple's rejection says the app "enables users to post content anonymously".
-- Venue Chat no longer uses "Guest N" labels (that was client-side only and is
-- changed in the app), and the Board no longer offers a "Post anonymously"
-- switch. This file closes the server side:
--   1. Every existing anonymous pin becomes a named pin.
--   2. A trigger forces is_anonymous = false on every insert and update, so an
--      older app build (or a hand-made request) cannot create an anonymous pin.
--
-- board_pins_for_zone() already returns the author's id and name for any pin that
-- is not anonymous, so no function changes are needed.

UPDATE board_pins SET is_anonymous = false WHERE is_anonymous = true;

CREATE OR REPLACE FUNCTION public.force_named_board_pin()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_anonymous := false;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_board_pins_force_named ON board_pins;
CREATE TRIGGER trg_board_pins_force_named
  BEFORE INSERT OR UPDATE ON board_pins
  FOR EACH ROW EXECUTE FUNCTION public.force_named_board_pin();

-- Verify (expect 0, then 1):
--   SELECT count(*) FROM board_pins WHERE is_anonymous = true;
--   SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_board_pins_force_named' AND NOT tgisinternal;
