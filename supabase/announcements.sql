-- Venue Announcements: one-way broadcast from venue owner to all checked-in users.
-- Shows as a banner in the zone screen. Auto-expires after 2 hours by default.

CREATE TABLE IF NOT EXISTS venue_announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  message     text NOT NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE venue_announcements ENABLE ROW LEVEL SECURITY;

-- Zone members see non-expired announcements
CREATE POLICY "Zone members see active announcements"
  ON venue_announcements FOR SELECT USING (
    expires_at > now() AND
    EXISTS (
      SELECT 1 FROM zone_members
      WHERE zone_id = venue_announcements.zone_id AND user_id = auth.uid()
    )
  );

-- Venue owners see all their own announcements
CREATE POLICY "Venue owner sees all announcements"
  ON venue_announcements FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM zones
      WHERE id = venue_announcements.zone_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Venue owner creates announcements"
  ON venue_announcements FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM zones
      WHERE id = venue_announcements.zone_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Venue owner deletes announcements"
  ON venue_announcements FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM zones
      WHERE id = venue_announcements.zone_id AND owner_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE venue_announcements;
