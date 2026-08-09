-- Stop the same venue being minted twice (Aug 2026).
-- Run once in Supabase. Supersedes the auto_approve_venue / admin_setup_zone
-- bodies in venue_polygon_canonical.sql — nothing else in that file changes.
--
-- THE BUG
-- Every writer that creates a zone deduped by OWNER and nothing else:
--
--   SELECT id INTO v_existing_zone_id FROM zones WHERE owner_id = p_owner_id;
--
-- A brand-new owner has no zone, so the check passes and a second zone is
-- inserted — even when a zone with that exact name already sits at that exact
-- address. That is how The 5 Spot ended up with two rows: we seeded the pilot
-- zone, then the real owner registered and got a fresh one 35m away with a
-- different radius. Patrons at one bar were splittable across two rooms, and
-- the only reason it never bit is that the seeded row happened to be inactive.
--
-- lib/venueSubmissions.ts approveSubmission() was worse — a blind INSERT with no
-- duplicate check of any kind. It now calls the same helper before inserting.
--
-- THE RULE
-- Same name, close enough together = the same venue. Claim the existing row
-- rather than adding another. Deliberately NOT a unique index on name: multi-city
-- is on the roadmap and two unrelated bars can share a name in different cities.
-- Proximity is what makes it the same PLACE, so proximity is what we match on.

-- ── The shared check ─────────────────────────────────────────────────────────
-- Returns the id of an existing zone that is, to the best of our knowledge, this
-- same venue. Inactive rows count: a deactivated duplicate is still the thing we
-- do not want a second copy of, and claiming it back is better than orphaning it.
--
-- 250m is chosen from the real miss: the 5 Spot's two pins were 35m apart
-- because the owner dropped a pin and we geocoded an address. It has to be loose
-- enough to survive that disagreement and tight enough that two genuinely
-- different venues in different neighbourhoods never collide.
CREATE OR REPLACE FUNCTION find_zone_by_name_near(
  p_name     text,
  p_lat      float,
  p_lng      float,
  p_within_m float DEFAULT 250
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id
  FROM zones
  WHERE lower(btrim(name)) = lower(btrim(p_name))
    AND ST_DWithin(
          center,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_within_m
        )
  -- An unclaimed row is the one we want to hand to a new owner; if several
  -- match, take the oldest so history stays with the original row.
  ORDER BY (owner_id IS NOT NULL), created_at
  LIMIT 1;
$$;

-- ── 1. auto_approve_venue — venue signup ─────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_approve_venue(
  p_profile_id  uuid,
  p_lat         float,
  p_lng         float,
  p_name        text,
  p_type        text,
  p_radius      int  DEFAULT 10,
  p_polygon_wkt text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing_zone_id uuid;
  v_existing_owner   uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_profile_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Their own zone first — this is an owner editing what they already have.
  SELECT id INTO v_existing_zone_id FROM zones WHERE owner_id = p_profile_id LIMIT 1;

  -- Otherwise: is this venue already in the system under someone else, or under
  -- nobody (a pilot seed)? Claim it instead of minting a second copy.
  IF v_existing_zone_id IS NULL THEN
    v_existing_zone_id := find_zone_by_name_near(p_name, p_lat, p_lng);

    IF v_existing_zone_id IS NOT NULL THEN
      SELECT owner_id INTO v_existing_owner FROM zones WHERE id = v_existing_zone_id;
      -- Already claimed by a DIFFERENT owner. Two people claiming one venue is a
      -- human problem; refuse rather than quietly hand the venue over or split
      -- the room in two.
      IF v_existing_owner IS NOT NULL AND v_existing_owner != p_profile_id THEN
        RAISE EXCEPTION 'Venue "%" already exists at this location and is claimed by another account', p_name
          USING HINT = 'An admin can reassign it from the venue panel.';
      END IF;
    END IF;
  END IF;

  IF v_existing_zone_id IS NOT NULL THEN
    UPDATE zones SET
      -- Claims an unclaimed pilot row; a no-op when it was already theirs.
      owner_id         = p_profile_id,
      name             = p_name,
      type             = p_type,
      center           = ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      center_lat       = p_lat,
      center_lng       = p_lng,
      radius_meters    = p_radius,
      is_active        = true,
      -- Overwrite only when a new polygon is provided; otherwise keep the current one.
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE building_polygon END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE polygon_source END
    WHERE id = v_existing_zone_id;
  ELSE
    INSERT INTO zones (name, type, center, center_lat, center_lng, radius_meters, owner_id, is_active, building_polygon, polygon_source)
    VALUES (
      p_name, p_type,
      ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      p_lat, p_lng, p_radius, p_profile_id, true,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE NULL END,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE NULL END
    );
  END IF;

  UPDATE profiles SET venue_status = 'approved', is_venue_owner = true WHERE id = p_profile_id;
  RETURN true;
END;
$$;

-- ── 2. admin_setup_zone — admin "Edit Zone" and admin_approve_venue ──────────
CREATE OR REPLACE FUNCTION admin_setup_zone(
  p_owner_id    uuid,
  p_zone_name   text,
  p_zone_type   text,
  p_lat         float,
  p_lng         float,
  p_radius      int,
  p_polygon_wkt text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_zone_id          uuid;
  v_existing_zone_id uuid;
  v_existing_owner   uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT id INTO v_existing_zone_id FROM zones WHERE owner_id = p_owner_id LIMIT 1;

  IF v_existing_zone_id IS NULL THEN
    v_existing_zone_id := find_zone_by_name_near(p_zone_name, p_lat, p_lng);

    IF v_existing_zone_id IS NOT NULL THEN
      SELECT owner_id INTO v_existing_owner FROM zones WHERE id = v_existing_zone_id;
      -- An admin gets a hard stop too. Reassigning a claimed venue should be a
      -- deliberate act on the venue itself, not a side effect of Edit Zone.
      IF v_existing_owner IS NOT NULL AND v_existing_owner != p_owner_id THEN
        RAISE EXCEPTION 'Venue "%" already exists at this location under another owner', p_zone_name
          USING HINT = 'Edit that zone directly, or clear its owner first.';
      END IF;
    END IF;
  END IF;

  IF v_existing_zone_id IS NOT NULL THEN
    UPDATE zones SET
      owner_id         = p_owner_id,
      name             = p_zone_name,
      type             = p_zone_type,
      center           = ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      center_lat       = p_lat,
      center_lng       = p_lng,
      radius_meters    = p_radius,
      is_active        = true,
      building_polygon = CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE building_polygon END,
      polygon_source   = CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE polygon_source END
    WHERE id = v_existing_zone_id
    RETURNING id INTO v_zone_id;
  ELSE
    INSERT INTO zones (owner_id, name, type, center, center_lat, center_lng, radius_meters, is_active, building_polygon, polygon_source)
    VALUES (
      p_owner_id, p_zone_name, p_zone_type,
      ST_GeographyFromText('POINT(' || p_lng::text || ' ' || p_lat::text || ')'),
      p_lat, p_lng, p_radius, true,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN ST_GeogFromText(p_polygon_wkt) ELSE NULL END,
      CASE WHEN p_polygon_wkt IS NOT NULL THEN 'osm' ELSE NULL END
    )
    RETURNING id INTO v_zone_id;
  END IF;

  RETURN v_zone_id;
END;
$$;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Should return zero rows. Any row here is a venue that exists twice.
--   SELECT lower(btrim(name)) AS name, count(*)
--   FROM zones GROUP BY 1 HAVING count(*) > 1;
--
-- And the helper should find the live 5 Spot from the address we geocoded:
--   SELECT find_zone_by_name_near('The 5 Spot', 36.1785202, -86.7507137);
