-- Jacob Sprint 1 — answers to 20 questions
-- Run in Supabase SQL Editor

-- 1. Notification preferences per user (venue_announcement, wemet_confirmed, message, dm_expiry)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT
    '{"venue_announcement":true,"wemet_confirmed":true,"message":true,"dm_expiry":true}'::jsonb;

-- 2. Founding Member badge — replaces the beta label permanently on all profiles
INSERT INTO badges (slug, name, description, icon, category)
VALUES (
  'founding_member',
  'Founding Member',
  'One of the original HereNow beta testers.',
  '🏛️',
  'presence'
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Award Founding Member badge to every user who already has a profile (all beta users)
INSERT INTO user_badges (user_id, badge_id)
SELECT p.id, b.id
FROM   profiles p
CROSS  JOIN badges b
WHERE  b.slug = 'founding_member'
ON CONFLICT (user_id, badge_id) DO NOTHING;
