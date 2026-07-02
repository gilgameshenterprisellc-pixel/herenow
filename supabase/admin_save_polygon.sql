-- admin_save_polygon: bypass RLS to write a building polygon for a zone.
-- Called from the admin panel Draw Polygon tool.
-- Direct .update() on zones fails silently because the RLS policy only
-- allows the zone's created_by user to update, not the admin.

CREATE OR REPLACE FUNCTION admin_save_polygon(
  p_zone_id  uuid,
  p_wkt      text,
  p_source   text DEFAULT 'manual'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE zones
  SET
    building_polygon = ST_GeogFromText(p_wkt),
    polygon_source   = p_source
  WHERE id = p_zone_id;

  RETURN FOUND;
END;
$$;
