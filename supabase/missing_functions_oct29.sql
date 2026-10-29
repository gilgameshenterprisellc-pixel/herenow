-- Three functions the app calls that production never had.
--
-- Found Oct 29 when Jacob could not approve a test venue ("Could not find the
-- function public.admin_approve_venue(p_lat, p_lng, p_polygon_wkt, ...)").
-- Every supabase.rpc() call in the app was then probed against the live API
-- (read-only GET requests, nothing written). All resolve except these three:
--
--   1. admin_approve_venue(..., p_polygon_wkt)
--      The app has sent p_polygon_wkt since Jun 27 (polygon_geofencing.sql),
--      but only the 6-argument version ever reached production. Approval was
--      rarely needed until signup stopped auto-approving (venue_owner_vetting),
--      so this is the first time anyone hit it. The polygon_geofencing version
--      had also dropped `is_venue_owner = true`, which venue_approval_fix.sql
--      added so an approved owner's dashboard stops saying "pending". This one
--      does both, clears any old denial reason, and goes through the current,
--      duplicate-guarded admin_setup_zone (venue_duplicate_guard.sql).
--
--   2. admin_qr_placement_stats(p_days)
--      Defined in admin_analytics_filters.sql; that file's other functions are
--      live, this one is not. The Pilot Dashboard's QR placement table has
--      been empty since Aug 1.
--
--   3. increment_event_rsvp(event_uuid)
--      Never created. The app then fell back to updating venue_events itself,
--      which only the event's creator may do, so RSVP counts could never move
--      for anyone else. venue_events has no rows yet, so nothing was lost.
--      The count is now kept by a trigger on event_rsvps, recounted from the
--      rows every time, so it can never drift or double count.
--
-- Safe to re-run.

-- ── 1. admin_approve_venue ───────────────────────────────────────────────────
-- One version only, so a call can never pick the stale one.
DROP FUNCTION IF EXISTS admin_approve_venue(uuid, text, text, float, float, int);

CREATE OR REPLACE FUNCTION admin_approve_venue(
  p_profile_id  uuid,
  p_zone_name   text,
  p_zone_type   text,
  p_lat         float,
  p_lng         float,
  p_radius      int,
  p_polygon_wkt text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  PERFORM admin_setup_zone(p_profile_id, p_zone_name, p_zone_type, p_lat, p_lng, p_radius, p_polygon_wkt);

  UPDATE profiles
  SET venue_status   = 'approved',
      is_venue_owner = true,
      denial_reason  = NULL
  WHERE id = p_profile_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_approve_venue(uuid, text, text, float, float, int, text) TO authenticated;

-- ── 2. admin_qr_placement_stats ──────────────────────────────────────────────
-- Copied unchanged from admin_analytics_filters.sql.
CREATE OR REPLACE FUNCTION admin_qr_placement_stats(p_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  since := CASE WHEN p_days IS NULL THEN NULL ELSE now() - make_interval(days => p_days) END;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result FROM (
    SELECT qc.placement AS placement,
      count(qs.id) FILTER (WHERE since IS NULL OR qs.scanned_at >= since) AS scans
    FROM qr_codes qc
    LEFT JOIN qr_scans qs ON qs.qr_code_id = qc.id
    GROUP BY qc.placement
    ORDER BY count(qs.id) FILTER (WHERE since IS NULL OR qs.scanned_at >= since) DESC
  ) t;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_qr_placement_stats(int) TO authenticated;

-- ── 3. Event RSVP counts ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recount_event_rsvps(p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE venue_events
  SET rsvp_count = (SELECT count(*) FROM event_rsvps WHERE event_id = p_event_id)
  WHERE id = p_event_id;
END $$;
REVOKE ALL ON FUNCTION recount_event_rsvps(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION event_rsvps_sync_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM recount_event_rsvps(COALESCE(NEW.event_id, OLD.event_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS event_rsvps_sync_count_trg ON event_rsvps;
CREATE TRIGGER event_rsvps_sync_count_trg
  AFTER INSERT OR DELETE ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION event_rsvps_sync_count();

-- The shipped app still calls this after an RSVP. It only recounts, so it
-- agrees with the trigger instead of adding to it.
CREATE OR REPLACE FUNCTION increment_event_rsvp(event_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM recount_event_rsvps(event_uuid);
END $$;
GRANT EXECUTE ON FUNCTION increment_event_rsvp(uuid) TO authenticated;

-- Bring any existing counts in line with the rows.
UPDATE venue_events e
SET rsvp_count = (SELECT count(*) FROM event_rsvps r WHERE r.event_id = e.id)
WHERE rsvp_count IS DISTINCT FROM (SELECT count(*) FROM event_rsvps r WHERE r.event_id = e.id);

NOTIFY pgrst, 'reload schema';

-- ── Check ────────────────────────────────────────────────────────────────────
-- One row per function: admin_approve_venue should list 7 arguments.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_approve_venue', 'admin_qr_placement_stats', 'increment_event_rsvp')
ORDER BY 1;
