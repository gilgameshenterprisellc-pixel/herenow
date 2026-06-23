-- Venue Highlights: curated showcase content pinned by venue owners
-- Visible to all visitors (checked-in or not), acts as the venue's "best of" showcase

CREATE TABLE IF NOT EXISTS venue_highlights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(title) <= 60),
  body        text CHECK (char_length(body) <= 200),
  emoji       text,
  position    int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE venue_highlights ENABLE ROW LEVEL SECURITY;

-- Anyone can read highlights (public showcase — not gated behind check-in)
CREATE POLICY "Highlights viewable by all" ON venue_highlights
  FOR SELECT USING (true);

-- Only zone owner can create highlights
CREATE POLICY "Zone owner can create highlights" ON venue_highlights
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid())
  );

-- Only zone owner can update highlights
CREATE POLICY "Zone owner can update highlights" ON venue_highlights
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid())
  );

-- Only zone owner can delete highlights
CREATE POLICY "Zone owner can delete highlights" ON venue_highlights
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid())
  );
