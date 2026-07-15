-- Anonymous in-app survey / feedback (July 2026). Run once in Supabase.
--
-- Responses are ANONYMOUS by design: no user_id is stored, so what the admin
-- reads cannot be traced back to a specific person. That is intentional — it
-- protects honest opinions. Answers are kept as a JSONB blob keyed by question
-- id, so the question set can change without a schema migration.

CREATE TABLE IF NOT EXISTS survey_submissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  answers      jsonb       NOT NULL,
  app_version  text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE survey_submissions ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can submit. No identity is captured on the row.
DROP POLICY IF EXISTS "anyone can submit survey" ON survey_submissions;
CREATE POLICY "anyone can submit survey" ON survey_submissions
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only admins can read submissions (viewed in the Admin hub).
DROP POLICY IF EXISTS "admins read surveys" ON survey_submissions;
CREATE POLICY "admins read surveys" ON survey_submissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX IF NOT EXISTS survey_submissions_submitted_at_idx
  ON survey_submissions (submitted_at DESC);
