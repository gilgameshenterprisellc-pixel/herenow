-- Founding venue tags (Jacob, Jul 2026)
-- ----------------------------------------------------------------------------
-- Curated status badges awarded BY HAND, not by the metric auto-award loop in
-- lib/venueBadges.ts. They live in the same zone_badges table as achievement
-- badges but render distinctly (gold, pinned first) on the venue page.
-- Idempotent: safe to re-run.

-- Martha My Dear: the first HereNow venue AND a founding partner.
INSERT INTO zone_badges (zone_id, slug, name, description, icon)
SELECT id, 'first_herenow_venue', 'First HereNow Venue',
       'The first venue ever on HereNow.', 'ribbon'
FROM zones WHERE name ILIKE 'Martha My Dear'
ON CONFLICT (zone_id, slug) DO NOTHING;

INSERT INTO zone_badges (zone_id, slug, name, description, icon)
SELECT id, 'founding_partner', 'Founding Partner',
       'An early Nashville partner that helped launch HereNow.', 'star'
FROM zones WHERE name ILIKE 'Martha My Dear'
ON CONFLICT (zone_id, slug) DO NOTHING;

-- Every other early Nashville venue -> Founding Partner.
-- Option A: tag one venue by exact name.
--   INSERT INTO zone_badges (zone_id, slug, name, description, icon)
--   SELECT id, 'founding_partner', 'Founding Partner',
--          'An early Nashville partner that helped launch HereNow.', 'star'
--   FROM zones WHERE name ILIKE '<Venue Name>'
--   ON CONFLICT (zone_id, slug) DO NOTHING;
--
-- Option B: tag by zone id (safest when names could collide).
--   INSERT INTO zone_badges (zone_id, slug, name, description, icon)
--   VALUES ('<zone-uuid>', 'founding_partner', 'Founding Partner',
--           'An early Nashville partner that helped launch HereNow.', 'star')
--   ON CONFLICT (zone_id, slug) DO NOTHING;

-- To remove a tag:
--   DELETE FROM zone_badges WHERE slug = 'founding_partner' AND zone_id = '<zone-uuid>';
