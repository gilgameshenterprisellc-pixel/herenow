-- Venue Subscriptions
-- Users can follow/subscribe to a venue after checking in.
-- Venues can then market directly to subscribers.

CREATE TABLE IF NOT EXISTS venue_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  zone_id       uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  subscribed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, zone_id)
);

ALTER TABLE venue_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own subscriptions"
  ON venue_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Zone owners can view their subscribers"
  ON venue_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()
    )
  );

-- Venue Promotions
CREATE TABLE IF NOT EXISTS venue_promotions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id        uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_by     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (char_length(title) <= 80),
  description    text CHECK (char_length(description) <= 400),
  discount_label text CHECK (char_length(discount_label) <= 50),
  post_to_feed   boolean DEFAULT false,
  expires_at     timestamptz,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE venue_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Promotions viewable by all" ON venue_promotions FOR SELECT USING (true);
CREATE POLICY "Zone owner can create promotions" ON venue_promotions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));
CREATE POLICY "Zone owner can delete promotions" ON venue_promotions FOR DELETE
  USING (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));

-- Venue Announcements
CREATE TABLE IF NOT EXISTS venue_announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id      uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message      text NOT NULL CHECK (char_length(message) <= 280),
  post_to_feed boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE venue_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Announcements viewable by all" ON venue_announcements FOR SELECT USING (true);
CREATE POLICY "Zone owner can create announcements" ON venue_announcements FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));
CREATE POLICY "Zone owner can delete announcements" ON venue_announcements FOR DELETE
  USING (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));

-- Check-in visibility privacy setting on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS checkin_visibility text DEFAULT 'full'
  CHECK (checkin_visibility IN ('full', 'minimal'));
