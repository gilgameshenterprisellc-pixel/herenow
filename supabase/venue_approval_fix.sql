-- Venue approval bug fix
-- Run this in Supabase SQL editor BEFORE deploying fix/venue-approval.
--
-- Root causes fixed here:
-- 1. zones.owner_id column didn't exist — the admin_setup_zone RPC was inserting
--    into a column that wasn't in the base schema, so every approval attempt failed.
-- 2. admin_approve_venue never set is_venue_owner = true, so even after approval
--    the venue owner's dashboard would still show "pending".

-- ── 1. Add owner_id to zones ────────────────────────────────────────────────
ALTER TABLE zones ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS zones_owner_id_idx ON zones(owner_id);

-- Allow venue owners to update their own zone (in addition to the creator policy)
DROP POLICY IF EXISTS "Zone owner can update their zone" ON zones;
CREATE POLICY "Zone owner can update their zone"
  ON zones FOR UPDATE USING (auth.uid() = owner_id OR auth.uid() = created_by);

-- ── 2. Fix admin_setup_zone — use owner_id, also populate created_by ────────
CREATE OR REPLACE FUNCTION admin_setup_zone(
  p_owner_id     uuid,
  p_zone_name    text,
  p_zone_type    text,
  p_lat          float,
  p_lng          float,
  p_radius       int
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_zone_id          uuid;
  v_existing_zone_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT id INTO v_existing_zone_id FROM zones WHERE owner_id = p_owner_id LIMIT 1;

  IF v_existing_zone_id IS NOT NULL THEN
    UPDATE zones SET
      name          = p_zone_name,
      type          = p_zone_type,
      center        = ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      center_lat    = p_lat,
      center_lng    = p_lng,
      radius_meters = p_radius,
      is_active     = true
    WHERE id = v_existing_zone_id
    RETURNING id INTO v_zone_id;
  ELSE
    INSERT INTO zones (owner_id, created_by, name, type, center, center_lat, center_lng, radius_meters, is_active)
    VALUES (
      p_owner_id,
      p_owner_id,
      p_zone_name,
      p_zone_type,
      ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      p_lat,
      p_lng,
      p_radius,
      true
    )
    RETURNING id INTO v_zone_id;
  END IF;

  RETURN v_zone_id;
END;
$$;

-- ── 3. Fix admin_approve_venue — also sets is_venue_owner = true ─────────────
CREATE OR REPLACE FUNCTION admin_approve_venue(
  p_profile_id   uuid,
  p_zone_name    text,
  p_zone_type    text,
  p_lat          float,
  p_lng          float,
  p_radius       int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  PERFORM admin_setup_zone(p_profile_id, p_zone_name, p_zone_type, p_lat, p_lng, p_radius);

  UPDATE profiles
  SET venue_status   = 'approved',
      is_venue_owner = true
  WHERE id = p_profile_id;
END;
$$;
