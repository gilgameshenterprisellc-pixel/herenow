-- Venue Promotions: deals/offers venues push to checked-in users.
-- Scheduled Promotions: same table, just a future starts_at — visible once starts_at is past.

CREATE TABLE IF NOT EXISTS venue_promotions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title       text NOT NULL,
  description text,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE venue_promotions ENABLE ROW LEVEL SECURITY;

-- Zone members see active, already-started, non-expired promotions
CREATE POLICY "Members see active promotions"
  ON venue_promotions FOR SELECT USING (
    is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
    AND EXISTS (
      SELECT 1 FROM zone_members
      WHERE zone_id = venue_promotions.zone_id AND user_id = auth.uid()
    )
  );

-- Venue owners see ALL their promotions (including upcoming/scheduled)
CREATE POLICY "Venue owner sees all promotions"
  ON venue_promotions FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM zones
      WHERE id = venue_promotions.zone_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Venue owner creates promotions"
  ON venue_promotions FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM zones
      WHERE id = venue_promotions.zone_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Venue owner updates promotions"
  ON venue_promotions FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM zones
      WHERE id = venue_promotions.zone_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Venue owner deletes promotions"
  ON venue_promotions FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM zones
      WHERE id = venue_promotions.zone_id AND owner_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE venue_promotions;
