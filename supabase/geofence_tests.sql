-- Geofence PostGIS assertions (Jul 2026). Run in the Supabase SQL editor.
--
-- This validates the geometric guarantees that user_in_zone() depends on:
-- boundary-inclusive containment, the check-in vs presence margins (the
-- hysteresis band), rejection of clearly-outside points, and correct handling
-- of CONCAVE footprints (a convex-hull check would wrongly include the notch).
--
-- It writes NOTHING (no zones inserted) and RAISEs on the first failed
-- assertion, so it is safe to run any time. Success prints a NOTICE.
--
-- Geometry is built with ST_Project (geodesic) so there are no hand-typed
-- coordinates. A 30m x 20m rectangle and an L-shaped footprint are centered on
-- an arbitrary anchor; all test points are projected from that center.

DO $$
DECLARE
  center geography := ST_GeographyFromText('POINT(-86.7816 36.1627)');
  rect   geography;
  lshape geography;
  d18 float := 18.0277563773;  -- hypot(15,10): rectangle corner distance
  d28 float := 28.2842712475;  -- hypot(20,20): L-shape corner distance
BEGIN
  -- 30m x 20m rectangle: corners NE, SE, SW, NW (walls at +/-15m E-W, +/-10m N-S)
  rect := ST_MakePolygon(ST_MakeLine(ARRAY[
    ST_Project(center, d18,  0.9827937232)::geometry,  -- NE ( 15,  10)
    ST_Project(center, d18,  2.1587989303)::geometry,  -- SE ( 15, -10)
    ST_Project(center, d18, -2.1587989303)::geometry,  -- SW (-15, -10)
    ST_Project(center, d18, -0.9827937232)::geometry,  -- NW (-15,  10)
    ST_Project(center, d18,  0.9827937232)::geometry   -- close
  ]))::geography;

  IF NOT ST_DWithin(rect, ST_Project(center, 14, radians(90)), 0) THEN
    RAISE EXCEPTION 'rect: a point 1m inside the wall should be inside at margin 0';
  END IF;
  IF NOT ST_DWithin(rect, center, 0) THEN
    RAISE EXCEPTION 'rect: center should be inside';
  END IF;
  IF ST_DWithin(rect, ST_Project(center, 27, radians(90)), 0) THEN
    RAISE EXCEPTION 'rect: 12m beyond the wall must be OUTSIDE at margin 0';
  END IF;
  IF NOT ST_DWithin(rect, ST_Project(center, 27, radians(90)), 15) THEN
    RAISE EXCEPTION 'rect: 12m beyond the wall should pass the check-in margin (15)';
  END IF;
  IF NOT ST_DWithin(rect, ST_Project(center, 27, radians(90)), 30) THEN
    RAISE EXCEPTION 'rect: 12m beyond the wall should pass the presence margin (30)';
  END IF;
  IF ST_DWithin(rect, ST_Project(center, 60, radians(90)), 15) THEN
    RAISE EXCEPTION 'rect: 45m beyond the wall must FAIL the check-in margin (15)';
  END IF;
  IF ST_DWithin(rect, ST_Project(center, 60, radians(90)), 30) THEN
    RAISE EXCEPTION 'rect: 45m beyond the wall must FAIL the presence margin (30)';
  END IF;

  -- L-shaped (concave) footprint: 40x40 minus the top-right 20x20 quadrant.
  lshape := ST_MakePolygon(ST_MakeLine(ARRAY[
    ST_Project(center, d28, -2.3561944902)::geometry,  -- (-20, -20)
    ST_Project(center, d28,  2.3561944902)::geometry,  -- ( 20, -20)
    ST_Project(center, 20,   radians(90))::geometry,   -- ( 20,   0)
    center::geometry,                                  -- (  0,   0)
    ST_Project(center, 20,   0)::geometry,             -- (  0,  20)
    ST_Project(center, d28, -0.7853981634)::geometry,  -- (-20,  20)
    ST_Project(center, d28, -2.3561944902)::geometry   -- close
  ]))::geography;

  -- The top-right notch is a cutout: a point there is OUTSIDE the L. A convex
  -- containment check would wrongly say inside — this proves concavity works.
  IF ST_DWithin(lshape, ST_Project(center, 16.9705627485, radians(45)), 0) THEN
    RAISE EXCEPTION 'L-shape: a point in the notch must be OUTSIDE at margin 0 (concave)';
  END IF;
  IF NOT ST_DWithin(lshape, ST_Project(center, 14.1421356237, 2.3561944902), 0) THEN
    RAISE EXCEPTION 'L-shape: a point in the arm should be inside';
  END IF;

  RAISE NOTICE 'geofence_tests: all assertions passed';
END $$;

-- ── Template: assert against a REAL venue (optional) ─────────────────────────
-- Replace <ZONE_ID>, <LAT>, <LNG>. margin_m = 15 is the check-in margin,
-- 30 is the presence margin. Returns true/false per the live function.
--   SELECT user_in_zone('<ZONE_ID>'::uuid, <LAT>, <LNG>, 15) AS can_check_in,
--          user_in_zone('<ZONE_ID>'::uuid, <LAT>, <LNG>, 30) AS stays_present;
