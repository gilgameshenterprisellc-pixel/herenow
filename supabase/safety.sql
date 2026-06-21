-- Safety reports: user reports another user's in-venue behavior
CREATE TABLE IF NOT EXISTS safety_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id      uuid REFERENCES zones(id) ON DELETE SET NULL,
  reason       text NOT NULL CHECK (reason IN ('harassment', 'inappropriate_behavior', 'spam', 'fake_account', 'other')),
  note         text,
  reviewed     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE safety_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own reports, but cannot read others'
CREATE POLICY "Users can create reports" ON safety_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Admins read all (use service role key from admin dashboard)

-- Block list: bidirectional exclusion from People List and We Met
CREATE TABLE IF NOT EXISTS user_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Users can manage their own block list
CREATE POLICY "Users can manage their blocks" ON user_blocks
  FOR ALL USING (auth.uid() = blocker_id);
