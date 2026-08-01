-- QR attribution for the Neighborhood Pilot (Jacob's Admin Portal spec, Jul 2026).
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- One code per venue per physical placement (window decal, coaster, host stand,
-- ...). Scans are logged through a SECURITY DEFINER RPC so an anonymous phone
-- browser can record a scan (it happens BEFORE the app is installed) without the
-- scans table being writable by the public.

-- ── 1. qr_codes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id    uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  placement  text NOT NULL,                 -- slug: 'window_decal', 'coaster', ...
  label      text,                          -- human label shown in admin
  code       text UNIQUE NOT NULL,          -- short slug used in the /q/<code> URL
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manage qr_codes" ON qr_codes;
CREATE POLICY "admin manage qr_codes" ON qr_codes FOR ALL
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Venue owners can read their own codes (for a future venue-facing QR report).
DROP POLICY IF EXISTS "owner reads own qr_codes" ON qr_codes;
CREATE POLICY "owner reads own qr_codes" ON qr_codes FOR SELECT
  USING (EXISTS (SELECT 1 FROM zones z WHERE z.id = qr_codes.zone_id AND z.owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS qr_codes_zone_idx ON qr_codes (zone_id);

-- ── 2. qr_scans ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_scans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id uuid NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  zone_id    uuid,                          -- denormalized for fast per-venue rollups
  platform   text,                          -- 'ios' | 'android' | 'other'
  user_agent text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE qr_scans ENABLE ROW LEVEL SECURITY;

-- No direct client writes; scans come in through log_qr_scan() below. Admins read
-- everything; owners read their own venue's scans.
DROP POLICY IF EXISTS "admin reads qr_scans" ON qr_scans;
CREATE POLICY "admin reads qr_scans" ON qr_scans FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "owner reads own qr_scans" ON qr_scans;
CREATE POLICY "owner reads own qr_scans" ON qr_scans FOR SELECT
  USING (EXISTS (SELECT 1 FROM zones z WHERE z.id = qr_scans.zone_id AND z.owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS qr_scans_code_time_idx ON qr_scans (qr_code_id, scanned_at);
CREATE INDEX IF NOT EXISTS qr_scans_zone_time_idx ON qr_scans (zone_id, scanned_at);

-- ── 3. log_qr_scan — public scan logger ──────────────────────────────────────
-- Called from the /q/<code> web route by an unauthenticated phone browser. Looks
-- up the active code, records the scan, and returns which venue it belongs to.
-- SECURITY DEFINER so it can insert without the scans table being public-writable.
CREATE OR REPLACE FUNCTION log_qr_scan(
  p_code       text,
  p_platform   text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (zone_id uuid, zone_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_qr RECORD;
BEGIN
  SELECT qr.id AS id, qr.zone_id AS zone_id
    INTO v_qr
    FROM qr_codes qr
   WHERE qr.code = p_code AND qr.is_active = true;

  IF NOT FOUND THEN
    RETURN;  -- unknown/disabled code: log nothing, return no row
  END IF;

  INSERT INTO qr_scans (qr_code_id, zone_id, platform, user_agent)
  VALUES (v_qr.id, v_qr.zone_id, left(p_platform, 16), left(p_user_agent, 400));

  RETURN QUERY
    SELECT z.id, z.name FROM zones z WHERE z.id = v_qr.zone_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_qr_scan(text, text, text) TO anon, authenticated;
