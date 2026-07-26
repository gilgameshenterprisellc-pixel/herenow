-- Verified blue badge for VENUES (Jacob, Jul 2026)
-- ----------------------------------------------------------------------------
-- The venue verification flag. Renders the blue location-pin badge (VerifiedBadge)
-- next to the venue name on the zone page. Mirror of profiles.is_verified, which
-- badges people; this one badges places. Awarded by hand (SQL / service role),
-- never self-serve.
--
-- IMPORTANT: run this BEFORE deploying the code that selects `is_verified` from
-- zones. The zone query uses an explicit column list, and Supabase fails the
-- whole query (returns null, not a partial row) if a selected column is missing.
-- Idempotent: safe to re-run.

ALTER TABLE zones ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Grant it. Jacob: only Martha My Dear for now; verify eligible venues going forward.
UPDATE zones SET is_verified = true WHERE name ILIKE 'Martha My Dear';

-- To grant another venue:
--   UPDATE zones SET is_verified = true WHERE name ILIKE '<Venue Name>';
-- To revoke:
--   UPDATE zones SET is_verified = false WHERE name ILIKE '<Venue Name>';


-- ── Stop venue owners from self-granting the badge ───────────────────────────
-- The zones UPDATE policy is `using (auth.uid() = owner_id OR auth.uid() =
-- created_by)` with no column limit, so an owner can update any column on their
-- own zone — including is_verified — via a crafted Supabase update outside the
-- app UI. For a trust badge that's a real integrity hole (same one profiles has;
-- see verified_badge.sql). This trigger blocks end-user (JWT) calls from changing
-- is_verified. SQL-editor / service-role grants (auth.uid() IS NULL) pass through.
-- It is a no-op for every normal venue edit (name, hours, avatar, member_count,
-- post_count) because those never touch is_verified.

CREATE OR REPLACE FUNCTION public.prevent_self_verify_zone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Venue verification (is_verified) cannot be changed by users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_verify_zone ON zones;
CREATE TRIGGER trg_prevent_self_verify_zone
  BEFORE UPDATE ON zones
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_verify_zone();
