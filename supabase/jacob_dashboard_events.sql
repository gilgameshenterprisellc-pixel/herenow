-- Venue dashboard We Mets stat + app_events foundation (Jacob, July 7 2026)
-- Run once in Supabase SQL editor.

-- 1. We Mets tonight for venue owners. we_met RLS is parties-only, so owners
--    need a SECURITY DEFINER aggregate — count only, no individual data.
CREATE OR REPLACE FUNCTION venue_wemets_today(zone_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM zones WHERE id = zone_uuid AND owner_id = auth.uid()
  ) THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO result
  FROM we_met
  WHERE zone_id = zone_uuid
    AND status = 'confirmed'
    AND confirmed_at > now() - INTERVAL '24 hours';

  RETURN result;
END $$;

-- 2. app_events — "collect the underlying data from day one" (Jacob Q18).
--    Users can only insert their own events; nobody but service role/admin reads.
CREATE TABLE IF NOT EXISTS app_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event      text NOT NULL,
  zone_id    uuid,
  props      jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own events" ON app_events;
CREATE POLICY "Users insert own events"
  ON app_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS app_events_event_time_idx ON app_events (event, created_at);
CREATE INDEX IF NOT EXISTS app_events_zone_time_idx  ON app_events (zone_id, created_at);
