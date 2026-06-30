-- Promo redemption tracking for venue staff
-- Each row = one person redeemed one promotion (idempotent unique constraint).
-- Only the zone owner can insert/view. Users are never told they've been tracked.

CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id  uuid NOT NULL REFERENCES venue_promotions(id) ON DELETE CASCADE,
  zone_id       uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  redeemed_by   uuid NOT NULL REFERENCES profiles(id), -- staff who marked it
  redeemed_at   timestamptz DEFAULT now(),
  note          text,
  UNIQUE(promotion_id, user_id)
);

ALTER TABLE promotion_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zone owner can read redemptions"
  ON promotion_redemptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));

CREATE POLICY "Zone owner can insert redemptions"
  ON promotion_redemptions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));

CREATE POLICY "Zone owner can delete redemptions"
  ON promotion_redemptions FOR DELETE
  USING (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));
