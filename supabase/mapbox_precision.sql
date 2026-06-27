-- Mapbox precision upgrade + auto-approval
-- Run in Supabase SQL editor before deploying feat/mapbox-precision.

-- 1. Store geocoding confidence so admin can see quality of each submission
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS venue_geocode_confidence FLOAT;

-- 2. auto_approve_venue — called at signup when Mapbox confidence >= 0.9.
--    Auth rules:
--      - Venue owner calling from client:  auth.uid() = p_profile_id  → allowed
--      - Stripe webhook via service role:  auth.uid() IS NULL          → allowed
--      - Any other authenticated caller:   auth.uid() != p_profile_id → rejected
--    When Stripe is wired up, the webhook calls this RPC with the service role
--    key after checkout.session.completed fires. No code changes needed here.
CREATE OR REPLACE FUNCTION auto_approve_venue(
  p_profile_id uuid,
  p_lat        float,
  p_lng        float,
  p_name       text,
  p_type       text,
  p_radius     int default 75
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing_zone_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_profile_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_existing_zone_id FROM zones WHERE owner_id = p_profile_id LIMIT 1;

  IF v_existing_zone_id IS NOT NULL THEN
    UPDATE zones SET
      name          = p_name,
      type          = p_type,
      center        = ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      center_lat    = p_lat,
      center_lng    = p_lng,
      radius_meters = p_radius,
      is_active     = true
    WHERE id = v_existing_zone_id;
  ELSE
    INSERT INTO zones (owner_id, created_by, name, type, center, center_lat, center_lng, radius_meters, is_active)
    VALUES (
      p_profile_id,
      p_profile_id,
      p_name,
      p_type,
      ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      p_lat,
      p_lng,
      p_radius,
      true
    );
  END IF;

  UPDATE profiles
  SET venue_status   = 'approved',
      is_venue_owner = true
  WHERE id = p_profile_id;

  RETURN true;
END;
$$;
