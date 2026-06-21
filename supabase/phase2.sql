-- =================================================================
-- HereNow Phase 2 Schema
-- Sessions, Social/Mood Mode, We Met, DMs, Pulse, Chat,
-- Events, Badges, Notifications, Afterglow
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. Enhance profiles with HereNow-specific columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS social_mode   text CHECK (social_mode  IN ('dating','friends','networking','just_vibes')),
  ADD COLUMN IF NOT EXISTS mood_mode     text CHECK (mood_mode    IN ('open','selective','not_today')) DEFAULT 'selective',
  ADD COLUMN IF NOT EXISTS age_range     text,
  ADD COLUMN IF NOT EXISTS photos        text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interest_tags text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS kickoffs      text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS safety_score  float   DEFAULT 1.0;

-- ─────────────────────────────────────────────────────────────────
-- 2. Sessions — one row per venue visit
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id        uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  social_mode    text NOT NULL CHECK (social_mode IN ('dating','friends','networking','just_vibes')),
  mood_mode      text NOT NULL CHECK (mood_mode   IN ('open','selective','not_today')) DEFAULT 'selective',
  checked_in_at  timestamptz DEFAULT now(),
  checked_out_at timestamptz,
  is_active      boolean DEFAULT true
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions"
  ON sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Zone members see active sessions in their zones"
  ON sessions FOR SELECT USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM zone_members
      WHERE zone_id = sessions.zone_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users create own sessions"
  ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own sessions"
  ON sessions FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. Pulse — ephemeral in-venue vibe posts (expires with session)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pulse_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     text,
  media_url   text,
  vibe_tag    text,
  expires_at  timestamptz NOT NULL DEFAULT (now() + INTERVAL '12 hours'),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE pulse_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zone members see non-expired pulse"
  ON pulse_posts FOR SELECT USING (
    expires_at > now() AND
    EXISTS (SELECT 1 FROM zone_members WHERE zone_id = pulse_posts.zone_id AND user_id = auth.uid())
  );

CREATE POLICY "Active session users post to pulse"
  ON pulse_posts FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id = pulse_posts.session_id AND user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users delete own pulse posts"
  ON pulse_posts FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. Venue Chat — ephemeral live group chat
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_chat (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES sessions(id) ON DELETE SET NULL,
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

ALTER TABLE venue_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zone members see live chat"
  ON venue_chat FOR SELECT USING (
    expires_at > now() AND
    EXISTS (SELECT 1 FROM zone_members WHERE zone_id = venue_chat.zone_id AND user_id = auth.uid())
  );

CREATE POLICY "Zone members send chat messages"
  ON venue_chat FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM zone_members WHERE zone_id = venue_chat.zone_id AND user_id = auth.uid())
  );

CREATE POLICY "Users delete own chat messages"
  ON venue_chat FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. We Met — mutual IRL confirmation handshake
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS we_met (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id              uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  initiator_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  initiator_session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  recipient_session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','confirmed','declined','expired')),
  initiated_at         timestamptz DEFAULT now(),
  confirmed_at         timestamptz,
  expires_at           timestamptz NOT NULL DEFAULT (now() + INTERVAL '4 hours'),
  UNIQUE (initiator_id, recipient_id, zone_id)
);

ALTER TABLE we_met ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties see their own We Met records"
  ON we_met FOR SELECT USING (auth.uid() = initiator_id OR auth.uid() = recipient_id);

CREATE POLICY "Initiator creates We Met request"
  ON we_met FOR INSERT WITH CHECK (auth.uid() = initiator_id);

CREATE POLICY "Parties update We Met status"
  ON we_met FOR UPDATE USING (auth.uid() = initiator_id OR auth.uid() = recipient_id);

-- ─────────────────────────────────────────────────────────────────
-- 6. Direct Messages — unlocked only after confirmed We Met
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  we_met_id    uuid NOT NULL REFERENCES we_met(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  sent_at      timestamptz DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  read_at      timestamptz
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties see non-expired DMs"
  ON direct_messages FOR SELECT USING (
    (auth.uid() = sender_id OR auth.uid() = recipient_id) AND expires_at > now()
  );

CREATE POLICY "Sender sends DM after confirmed We Met"
  ON direct_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM we_met
      WHERE id = direct_messages.we_met_id
        AND status = 'confirmed'
        AND (initiator_id = auth.uid() OR recipient_id = auth.uid())
    )
  );

CREATE POLICY "Recipient marks DMs read"
  ON direct_messages FOR UPDATE USING (auth.uid() = recipient_id);

-- ─────────────────────────────────────────────────────────────────
-- 7. Afterglow — post-session recap
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afterglow (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  zone_name     text NOT NULL,
  zone_id       uuid REFERENCES zones(id) ON DELETE SET NULL,
  people_count  int DEFAULT 0,
  we_met_count  int DEFAULT 0,
  duration_mins int DEFAULT 0,
  highlights    text[] DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE afterglow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own afterglow"
  ON afterglow FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own afterglow"
  ON afterglow FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 8. Badges
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  icon        text,
  category    text CHECK (category IN ('courage','kindness','exploration','connection','presence'))
);

CREATE TABLE IF NOT EXISTS user_badges (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id  uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Badges viewable by everyone"       ON badges      FOR SELECT USING (true);
CREATE POLICY "User badges viewable by everyone"  ON user_badges FOR SELECT USING (true);
CREATE POLICY "System awards badges"              ON user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

INSERT INTO badges (slug, name, description, icon, category) VALUES
  ('first_checkin',    'First Steps',      'Checked in to your first venue',               '🚶', 'presence'),
  ('first_wemet',      'The Handshake',    'Confirmed your first We Met',                  '🤝', 'connection'),
  ('courage_badge',    'Courage',          'Sent a We Met request to someone you just met','💪', 'courage'),
  ('social_butterfly', 'Social Butterfly', 'Confirmed 5 We Met handshakes',                '🦋', 'connection'),
  ('connector',        'Connector',        'Connected with 10 different people',           '🔗', 'connection'),
  ('venue_explorer',   'Explorer',         'Checked in to 5 different venues',             '🗺️', 'exploration'),
  ('regular',          'Regular',          'Checked in to the same venue 5 times',         '🏠', 'presence'),
  ('night_owl',        'Night Owl',        'Checked in after midnight',                    '🦉', 'exploration'),
  ('early_bird',       'Early Bird',       'Checked in before 9am',                        '🌅', 'exploration'),
  ('vibe_setter',      'Vibe Setter',      'Posted 10 Pulse moments',                      '✨', 'presence'),
  ('chat_regular',     'Chat Regular',     'Sent 25 messages in Live Chat',                '💬', 'kindness'),
  ('good_vibes',       'Good Vibes Only',  'Never received a safety report',               '😊', 'kindness')
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 9. Venue Events
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title       text NOT NULL,
  description text,
  event_type  text DEFAULT 'general',
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  rsvp_count  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   uuid REFERENCES venue_events(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE venue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events viewable by everyone"  ON venue_events FOR SELECT USING (true);
CREATE POLICY "Zone members create events"
  ON venue_events FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (SELECT 1 FROM zone_members WHERE zone_id = venue_events.zone_id AND user_id = auth.uid())
  );
CREATE POLICY "Creators update their events"
  ON venue_events FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Creators delete their events"
  ON venue_events FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY "RSVPs viewable by everyone" ON event_rsvps FOR SELECT USING (true);
CREATE POLICY "Users manage own RSVPs"     ON event_rsvps FOR ALL   USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 10. Notifications
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  data       jsonb DEFAULT '{}',
  is_read    boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"   ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System creates notifications"  ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users mark notifications read" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 11. Helper function: who is currently checked in at a zone
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION active_sessions_in_zone(zone_uuid uuid)
RETURNS TABLE (
  session_id    uuid,
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  social_mode   text,
  mood_mode     text,
  interest_tags text[],
  kickoffs      text[],
  checked_in_at timestamptz
) AS $$
  SELECT
    s.id,
    s.user_id,
    p.display_name,
    p.avatar_url,
    s.social_mode,
    s.mood_mode,
    p.interest_tags,
    p.kickoffs,
    s.checked_in_at
  FROM sessions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.zone_id = zone_uuid
    AND s.is_active = true
  ORDER BY s.checked_in_at ASC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Enable realtime for live features
ALTER PUBLICATION supabase_realtime ADD TABLE venue_chat;
ALTER PUBLICATION supabase_realtime ADD TABLE pulse_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE we_met;
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
