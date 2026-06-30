-- Venue photo gallery — venues upload photos, visible to all users in zone detail
CREATE TABLE IF NOT EXISTS venue_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  public_url  text NOT NULL,
  storage_path text NOT NULL,
  caption     text CHECK (char_length(caption) <= 120),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE venue_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue photos viewable by everyone"
  ON venue_photos FOR SELECT USING (true);

CREATE POLICY "Zone owner can upload photos"
  ON venue_photos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));

CREATE POLICY "Zone owner can delete photos"
  ON venue_photos FOR DELETE
  USING (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));
