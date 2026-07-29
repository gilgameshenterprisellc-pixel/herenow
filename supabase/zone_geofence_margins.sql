-- Per-venue geofence tuning (Jul 2026, Jacob geofence idea #6).
-- Run once in Supabase.
--
-- Lets each zone override the global check-in / presence hysteresis margins so a
-- difficult location (thick walls, big room, weak GPS) can be loosened without
-- affecting every other venue. Both columns are nullable: NULL means "use the
-- app defaults" (CHECKIN_MARGIN_M = 15, PRESENCE_MARGIN_M = 30 in lib/sessions.ts).
--
-- These feed the existing margin_m parameter of user_in_zone() — the app reads
-- the per-zone value at check-in and presence-verify time and falls back to the
-- defaults when it is NULL. No change to user_in_zone() itself is required.
--
-- Invariant the app relies on: presence_margin_m should be >= checkin_margin_m
-- (you are let in tighter than you are kicked out — the hysteresis band). The
-- venue dashboard only writes matched preset pairs, so this always holds.

ALTER TABLE zones ADD COLUMN IF NOT EXISTS checkin_margin_m  INTEGER;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS presence_margin_m INTEGER;
