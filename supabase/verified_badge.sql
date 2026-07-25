-- Verified blue badge (Jacob, Jul 2026)
-- ----------------------------------------------------------------------------
-- The org/creator verification flag. Renders the blue location-pin badge next to
-- the display name on the profile + public profile screens (VerifiedBadge). This
-- is separate from is_founder (the gold founders badge) — a profile can carry
-- either, both, or neither.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Grant it. Fill in the verified account emails (orgs, creators, partners).
UPDATE profiles
SET is_verified = true
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    '<verified-account-email>'
    -- , '<another-verified-email>'
  )
);

-- To revoke:
--   UPDATE profiles SET is_verified = false
--   WHERE id IN (SELECT id FROM auth.users WHERE email = '<email>');


-- ── RECOMMENDED: stop users from self-granting a badge ───────────────────────
-- The profiles UPDATE policy is `using (auth.uid() = id)` with no column limit,
-- so a user can update any column on their own row — including is_verified and
-- is_founder — by crafting a Supabase update outside the app UI. For a trust
-- badge that's a real integrity hole. This trigger blocks end-user (JWT) calls
-- from changing either flag. Grants run from the SQL editor or a service-role key
-- (auth.uid() IS NULL) and pass through untouched. It is a no-op for every normal
-- profile edit (name, avatar, modes) because those never change these columns.

CREATE OR REPLACE FUNCTION public.prevent_self_badge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.is_founder IS DISTINCT FROM OLD.is_founder
       OR NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Badge flags (is_founder / is_verified) cannot be changed by users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_badge ON profiles;
CREATE TRIGGER trg_prevent_self_badge
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_badge();
