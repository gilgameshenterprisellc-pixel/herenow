-- Founder gold badge (Jacob, Jul 2026)
-- ----------------------------------------------------------------------------
-- A curated gold verified badge for HereNow founders / early backers. This is
-- NOT the org/creator verification system (that's a separate post-MVP feature);
-- it's a deliberate small flag so the founding crew reads as verified. Renders
-- gold next to the display name on the profile + public profile screens.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false;

-- Grant it. Fill in the founders' account emails (Joshua, Jacob, Jamie, backers).
-- Jacob's is prefilled from the admin-access note in CLAUDE.md; add the rest.
UPDATE profiles
SET is_founder = true
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'hillenbrand.jacob@gmail.com'
    -- , '<joshua-herenow-email>'
    -- , '<jamie-email>'
    -- , '<investor-email>'
  )
);

-- To revoke:
--   UPDATE profiles SET is_founder = false
--   WHERE id IN (SELECT id FROM auth.users WHERE email = '<email>');
