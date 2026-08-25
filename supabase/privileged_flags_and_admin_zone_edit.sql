-- Privileged-flag guard + admin venue editing (Aug 2026).
--
-- Both statements below were applied by hand in the SQL editor when they were
-- found. This file exists so they are in version control and a rebuilt
-- environment gets them too. Both are idempotent; re-running is safe.

-- ── 1. is_demo was self-grantable ────────────────────────────────────────────
-- lib/sessions.ts (checkIn) skips the geofence entirely for a profile with
-- is_demo = true. That is deliberate and exists so App Review can reach a venue
-- room from Cupertino.
--
-- The problem: the profiles UPDATE policy is `using (auth.uid() = id)` with no
-- column restriction, and Postgres RLS cannot restrict columns. So any signed-in
-- user could set is_demo = true on their own row with a crafted update and then
-- check into any venue on earth, permanently, from anywhere.
--
-- That is not a cosmetic hole. "Everyone in this room is actually in this room"
-- is the single promise the whole product rests on.
--
-- prevent_self_badge() already existed for exactly this reason, guarding
-- is_founder and is_verified. is_demo was added in Aug 2026 and never added to
-- it. This adds it. Service-role and SQL-editor calls have auth.uid() IS NULL
-- and still pass through, so seeding demo accounts is unaffected.
CREATE OR REPLACE FUNCTION public.prevent_self_badge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.is_founder  IS DISTINCT FROM OLD.is_founder
       OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.is_demo     IS DISTINCT FROM OLD.is_demo THEN
      RAISE EXCEPTION 'Privileged flags (is_founder / is_verified / is_demo) cannot be changed by users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The trigger already points at this function by name, but recreate it so a
-- fresh database that runs this file standalone still gets it.
DROP TRIGGER IF EXISTS trg_prevent_self_badge ON profiles;
CREATE TRIGGER trg_prevent_self_badge
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_badge();

-- ── 2. Admins could not edit venues they do not own ──────────────────────────
-- The zones UPDATE policy was `owner_id OR created_by` with no admin override,
-- so /admin/venues could not actually write to any venue an admin did not
-- personally own. Combined with the discarded error in app/venue/edit.tsx it
-- failed silently and reported success, which is how a venue photo appeared to
-- update for six weeks without ever changing.
DROP POLICY IF EXISTS "Zone owners update" ON zones;
CREATE POLICY "Zone owners update"
  ON zones FOR UPDATE USING (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin)
  );
