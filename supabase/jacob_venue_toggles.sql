-- Venue can disable Chat and/or Pulse (Jacob feedback 6). Run once in Supabase.
--
-- For fancy/intimate venues that want to be on the map without the social feed,
-- or to shut it down on a chaotic night. Both default ON so nothing changes for
-- existing venues.

ALTER TABLE zones ADD COLUMN IF NOT EXISTS chat_enabled  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS pulse_enabled BOOLEAN NOT NULL DEFAULT TRUE;
