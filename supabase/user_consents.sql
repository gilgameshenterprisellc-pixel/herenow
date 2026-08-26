-- Signup consent record (Aug 2026).
--
-- Jacob: "store the user ID + timestamp + version number of the Terms/Privacy
-- Policy/Community Guidelines they accepted. If we update them later, we can
-- require users to accept the new version."
--
-- The version column is the whole point. A boolean "accepted terms" flag tells
-- you somebody agreed to something at some point, which is worth very little the
-- first time the documents change, or the first time a moderation decision gets
-- challenged and the question is what they were actually shown.

CREATE TABLE IF NOT EXISTS user_consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document    text NOT NULL CHECK (document IN ('terms', 'privacy', 'guidelines')),
  version     integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),

  -- Re-accepting the same revision is a no-op rather than a duplicate row, which
  -- is what lets lib/consent.ts upsert without worrying about retries.
  UNIQUE (user_id, document, version)
);

CREATE INDEX IF NOT EXISTS user_consents_user_idx ON user_consents (user_id);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

-- Users record and read their own consent.
DROP POLICY IF EXISTS "Users insert own consent" ON user_consents;
CREATE POLICY "Users insert own consent"
  ON user_consents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own consent" ON user_consents;
CREATE POLICY "Users read own consent"
  ON user_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins read all of it. This record exists to be produced when someone asks
-- what a user agreed to, so it has to be readable by the people who would be
-- asked. Deliberately SELECT only: nobody edits a consent record after the fact,
-- including us. There is no UPDATE or DELETE policy for anyone.
DROP POLICY IF EXISTS "Admins read all consent" ON user_consents;
CREATE POLICY "Admins read all consent"
  ON user_consents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin));
