-- Venue submissions (Jacob Q8). Users nominate a venue → admin review queue →
-- approve spins up a live unclaimed zone. Run once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS venue_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name          text NOT NULL,
  category      text,
  address       text,
  latitude      double precision,
  longitude     double precision,
  venue_contact text,
  note          text,
  status        text DEFAULT 'pending',   -- 'pending' | 'approved' | 'dismissed'
  created_at    timestamptz DEFAULT now(),
  reviewed_at   timestamptz
);

ALTER TABLE venue_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can suggest a venue (their own row)
DROP POLICY IF EXISTS "Users submit venues" ON venue_submissions;
CREATE POLICY "Users submit venues"
  ON venue_submissions FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);

-- Submitter can see their own suggestions; admins can see all
DROP POLICY IF EXISTS "See own or admin all" ON venue_submissions;
CREATE POLICY "See own or admin all"
  ON venue_submissions FOR SELECT
  USING (
    auth.uid() = submitted_by
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admins review (approve / dismiss)
DROP POLICY IF EXISTS "Admins review submissions" ON venue_submissions;
CREATE POLICY "Admins review submissions"
  ON venue_submissions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX IF NOT EXISTS venue_submissions_status_idx ON venue_submissions (status, created_at);
