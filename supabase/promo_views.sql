-- Track when users view a promotion — used for Promotion Performance on venue dashboard
CREATE TABLE IF NOT EXISTS promo_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES venue_promotions(id) ON DELETE CASCADE,
  zone_id      uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  viewed_at    timestamptz DEFAULT now(),
  UNIQUE(promotion_id, user_id)  -- one row per user per promo
);

ALTER TABLE promo_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users log own views"
  ON promo_views FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Zone owner reads promo views"
  ON promo_views FOR SELECT
  USING (EXISTS (SELECT 1 FROM zones WHERE id = zone_id AND owner_id = auth.uid()));
