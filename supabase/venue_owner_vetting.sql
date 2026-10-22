-- Venue owners wait for an admin before they go live (Oct 2026).
-- Run once in the Supabase SQL editor. Idempotent; re-running is safe.
-- Run it BEFORE merging the PR: the admin Deny button sends p_reason (§4).
--
-- THE BUG (Jacob, Oct 22: "any joe schmo off the streets can claim a venue")
-- Venue signup called auto_approve_venue whenever Mapbox was confident about
-- the address. Mapbox is confident about nearly every real address, so every
-- venue signup went straight to approved, created a live zone, and never
-- reached the Pending tab in /admin/venues. Typing the name and street of an
-- unowned pilot venue also handed that venue over (find_zone_by_name_near).
--
-- The app no longer calls it, but every iOS build already installed does, so
-- the real fix has to live here. Three more holes sat behind the same door:
--
--   * The profiles UPDATE policy is `auth.uid() = id` with no column limit,
--     and prevent_self_badge() only guarded is_founder / is_verified / is_demo.
--     Any signed-in user could PATCH their own row to is_admin = true or
--     venue_status = 'approved' using the public anon key. INSERT had no guard
--     at all, so the same could be done at signup.
--   * auto_approve_venue allowed auth.uid() IS NULL (for a future Stripe
--     webhook). Supabase grants EXECUTE to anon by default, so a caller with no
--     login could run it against any profile id.
--   * The zones INSERT policy was `auth.uid() IS NOT NULL`: any account could
--     put a venue on the map straight through the API.

-- ── 1. auto_approve_venue: service role only ──────────────────────────────────
-- Kept (the Stripe idea may come back) but no app caller can reach it. Old builds
-- get a permission error, log it, and land on "Application Under Review".
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auto_approve_venue'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- ── 2. Privileged profile columns: admins and the service role only ──────────
-- True for the SQL editor, migrations and the service-role key (no end-user
-- JWT), and for a signed-in admin. False for anon and every other user.
CREATE OR REPLACE FUNCTION public.hn_caller_is_trusted()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN true;
  END IF;
  RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true);
END;
$$;

-- Columns are compared through jsonb so a column that does not exist in this
-- database reads as NULL on both sides instead of breaking every profile save.
CREATE OR REPLACE FUNCTION public.prevent_self_badge()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_col text;
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := to_jsonb(OLD);
BEGIN
  IF public.hn_caller_is_trusted() THEN
    RETURN NEW;
  END IF;

  -- RLS lets a user update their own row and no other, so a write to someone
  -- else's row can only come from one of our SECURITY DEFINER functions (the
  -- report auto-hide setting hidden_until on the person reported, for one).
  IF auth.uid() IS NOT NULL AND NEW.id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  FOREACH v_col IN ARRAY ARRAY[
    'is_admin', 'venue_status', 'is_venue_owner',
    'is_founder', 'is_verified', 'is_demo',
    'is_muted', 'is_banned', 'hidden_until'
  ] LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      RAISE EXCEPTION 'Only an admin can change %', v_col USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_badge ON profiles;
CREATE TRIGGER trg_prevent_self_badge
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_badge();

-- At signup a user may say they are a venue (is_venue_owner) but every
-- privileged flag is reset, and a venue always starts pending. Coerced rather
-- than rejected so an unexpected client value can never strand a half-made
-- account. jsonb_populate_record skips keys this table does not have.
CREATE OR REPLACE FUNCTION public.profiles_insert_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.hn_caller_is_trusted() THEN
    RETURN NEW;
  END IF;

  NEW := jsonb_populate_record(NEW, jsonb_build_object(
    'is_admin',     false,
    'is_founder',   false,
    'is_verified',  false,
    'is_demo',      false,
    'is_muted',     false,
    'is_banned',    false,
    'hidden_until', NULL,
    'venue_status', CASE
                      WHEN coalesce((to_jsonb(NEW) ->> 'is_venue_owner')::boolean, false)
                      THEN 'pending' ELSE 'none'
                    END
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_insert_defaults ON profiles;
CREATE TRIGGER trg_profiles_insert_defaults
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_insert_defaults();

-- ── 3. Only approved venue owners and admins create zones ────────────────────
-- Approved owners use /venue/edit and /zone/create (owner_id = themselves);
-- admins use the approval queue and venue suggestions.
DROP POLICY IF EXISTS "Authenticated users can create zones" ON zones;
DROP POLICY IF EXISTS "Approved venue owners and admins create zones" ON zones;
CREATE POLICY "Approved venue owners and admins create zones"
  ON zones FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    OR (
      owner_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND is_venue_owner = true AND venue_status = 'approved'
      )
    )
  );

-- ── 4. Deny saves its reason ─────────────────────────────────────────────────
-- The admin screen wrote denial_reason with a plain client update of the
-- applicant's row. RLS limits that to your own row, so it changed nothing and
-- the applicant was told "not approved" with no reason. The RPC writes it now.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS denial_reason text;

DROP FUNCTION IF EXISTS admin_deny_venue(uuid);
CREATE OR REPLACE FUNCTION admin_deny_venue(
  p_profile_id uuid,
  p_reason     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles
  SET venue_status = 'denied',
      denial_reason = coalesce(p_reason, denial_reason)
  WHERE id = p_profile_id;
END;
$$;

-- ── Check what is already out there (read-only) ─────────────────────────────
-- Every approved venue owner. Each one was auto-approved, so nobody has looked
-- at them. Anything you do not recognize, deny it from /admin/venues → Live.
--   SELECT p.display_name, u.email, p.phone, p.created_at, z.name AS zone, z.is_active
--   FROM profiles p
--   JOIN auth.users u ON u.id = p.id
--   LEFT JOIN zones z ON z.owner_id = p.id
--   WHERE p.venue_status = 'approved'
--   ORDER BY p.created_at DESC;
--
-- Every admin. Should be exactly the people you made admin.
--   SELECT p.display_name, u.email FROM profiles p
--   JOIN auth.users u ON u.id = p.id WHERE p.is_admin;
--
-- Zones owned by someone who is not an approved venue owner.
--   SELECT z.name, z.created_at, z.is_active, p.display_name AS owner, p.venue_status
--   FROM zones z LEFT JOIN profiles p ON p.id = z.owner_id
--   WHERE z.owner_id IS NOT NULL AND coalesce(p.venue_status, '') <> 'approved';
--
-- The zones insert policy should be the only INSERT row here.
--   SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'zones';
