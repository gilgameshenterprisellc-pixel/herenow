-- Let venues actually create events. Run once.
--
-- venue_events has sat at 0 rows since launch. Not because nobody tried — because
-- the INSERT policy made it impossible for the only people who would:
--
--   CREATE POLICY "Zone members create events"
--     ON venue_events FOR INSERT WITH CHECK (
--       auth.uid() = created_by AND
--       EXISTS (SELECT 1 FROM zone_members WHERE zone_id = ... AND user_id = auth.uid())
--     );
--
-- zone_members is only ever written by the check-in path (lib/sessions.ts). And a
-- venue owner never checks in — the dashboard is their home, not the zone tabs.
-- So a venue owner has no zone_members row for their own venue, and every event
-- they tried to create was refused. Same for an organization owner scheduling at
-- their host venue.
--
-- The failure was near-silent: the insert returns an RLS error, createEvent logs
-- it to a console nobody is watching and returns null, and the screen tells the
-- user "Could not save the event. Check your connection and try again." So it
-- reads as a network blip rather than a permission wall, and you try again
-- tomorrow and give up.
--
-- Three legitimate authors, so three branches. Membership stays — that was the
-- original intent for checked-in people — with ownership added alongside it.

DROP POLICY IF EXISTS "Zone members create events" ON venue_events;

CREATE POLICY "Venue owners, org owners and members create events"
  ON venue_events FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND (
      -- The venue owner, at their own venue. This is the common case and the
      -- one the old policy locked out.
      EXISTS (
        SELECT 1 FROM zones z
        WHERE z.id = venue_events.zone_id AND z.owner_id = auth.uid()
      )
      -- An organization owner, at the venue that org calls home.
      OR EXISTS (
        SELECT 1 FROM organizations o
        WHERE o.owner_id = auth.uid() AND o.host_zone_id = venue_events.zone_id
      )
      -- Someone currently checked in, which is what the original policy meant.
      OR EXISTS (
        SELECT 1 FROM zone_members m
        WHERE m.zone_id = venue_events.zone_id AND m.user_id = auth.uid()
      )
    )
  );

-- UPDATE and DELETE are already correct (auth.uid() = created_by) and are left
-- alone: you may only ever change an event you created.
