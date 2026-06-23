-- Admin Controls & Content Moderation
-- Run after all existing migrations

-- 1. Admin flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin  BOOLEAN DEFAULT FALSE;

-- 2. Muted flag on profiles (prevents creating pulse posts and chat messages)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_muted  BOOLEAN DEFAULT FALSE;

-- 3. Hidden flag on pulse posts (admin can hide individual posts without deleting)
ALTER TABLE pulse_posts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- 4. Hidden flag on venue chat messages
ALTER TABLE venue_chat ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- 5. venue_status = 'denied' needs to be allowed (add if constraint exists)
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_venue_status_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_venue_status_check
--   CHECK (venue_status IN ('none', 'pending', 'approved', 'denied'));

-- 6. Content reports table
CREATE TABLE IF NOT EXISTS content_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  zone_id       uuid REFERENCES zones(id) ON DELETE SET NULL,
  content_type  text NOT NULL CHECK (content_type IN ('pulse_post', 'chat_message')),
  content_id    uuid NOT NULL,
  reason        text NOT NULL,
  status        text DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  admin_note    text,
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(reporter_id, content_type, content_id)
);

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can file content reports" ON content_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users see own reports; admins see all" ON content_reports
  FOR SELECT USING (
    auth.uid() = reporter_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update reports" ON content_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 7. RPC: Admin setup / update a zone with proper PostGIS geometry
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
    INSERT INTO zones (owner_id, name, type, center, center_lat, center_lng, radius_meters, is_active)
    VALUES (
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

-- 8. RPC: Approve a venue (sets venue_status = 'approved' + sets up zone geofencing)
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

  UPDATE profiles SET venue_status = 'approved' WHERE id = p_profile_id;
END;
$$;

-- 9. RPC: Deny a venue application
CREATE OR REPLACE FUNCTION admin_deny_venue(
  p_profile_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles SET venue_status = 'denied' WHERE id = p_profile_id;
END;
$$;

-- 10. RPC: Hide/unhide a content item (pulse post or chat message)
CREATE OR REPLACE FUNCTION admin_set_content_hidden(
  p_content_type text,
  p_content_id   uuid,
  p_hidden       boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  IF p_content_type = 'pulse_post' THEN
    UPDATE pulse_posts SET is_hidden = p_hidden WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_message' THEN
    UPDATE venue_chat SET is_hidden = p_hidden WHERE id = p_content_id;
  END IF;
END;
$$;

-- 11. RPC: Mute / unmute a user
CREATE OR REPLACE FUNCTION admin_set_user_muted(
  p_user_id uuid,
  p_muted   boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles SET is_muted = p_muted WHERE id = p_user_id;
END;
$$;

-- GRANT admin is_admin = true manually in Supabase for Jacob and Jamie:
-- UPDATE profiles SET is_admin = true WHERE id = '<jacob_user_uuid>';
-- UPDATE profiles SET is_admin = true WHERE id = '<jamie_user_uuid>';
