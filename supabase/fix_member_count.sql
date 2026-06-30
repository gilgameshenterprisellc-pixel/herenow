-- Fix: zones.member_count only ever incremented, never decremented.
--
-- The old triggers fired on INSERT/DELETE of zone_members rows. But check-out
-- does an UPDATE (is_present = false), not a DELETE — the row stays so the
-- venue keeps a subscriber/history record. So member_count only ever went up,
-- showing phantom "X people here" on venues that are actually empty.
--
-- This switches the trigger to track is_present transitions directly, and
-- backfills every zone's count from real current presence.

DROP TRIGGER IF EXISTS trg_increment_zone_member_count ON zone_members;
DROP TRIGGER IF EXISTS trg_decrement_zone_member_count ON zone_members;

CREATE OR REPLACE FUNCTION sync_zone_member_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_present THEN
      UPDATE zones SET member_count = member_count + 1 WHERE id = NEW.zone_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_present AND NOT OLD.is_present THEN
      UPDATE zones SET member_count = member_count + 1 WHERE id = NEW.zone_id;
    ELSIF OLD.is_present AND NOT NEW.is_present THEN
      UPDATE zones SET member_count = GREATEST(0, member_count - 1) WHERE id = NEW.zone_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_present THEN
      UPDATE zones SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.zone_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_zone_member_count
  AFTER INSERT OR UPDATE OR DELETE ON zone_members
  FOR EACH ROW EXECUTE PROCEDURE sync_zone_member_count();

-- One-time backfill: recompute every zone's count from actual current presence
UPDATE zones z
SET member_count = COALESCE((
  SELECT COUNT(*) FROM zone_members zm WHERE zm.zone_id = z.id AND zm.is_present = true
), 0);
