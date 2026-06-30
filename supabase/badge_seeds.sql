-- New badge tiers: leveling + venue-specific + more milestones
-- ON CONFLICT DO NOTHING so re-running is safe
INSERT INTO badges (slug, name, description, icon, category) VALUES
  ('explorer_ii',     'Explorer II',      'Checked into 15+ venues',                   '🧭', 'exploration'),
  ('explorer_iii',    'Explorer III',     'Checked into 50+ venues',                   '🗺️', 'exploration'),
  ('adventurer',      'Adventurer',       'Visited 3 different venues',                '🌍', 'exploration'),
  ('venue_regular',   'Regular',          'Checked in 5+ times at the same spot',      '🏠', 'presence'),
  ('social_legend',   'Social Legend',    'Made 25+ real connections',                 '🌟', 'connection'),
  ('pulse_master',    'Pulse Master',     'Posted 50+ Pulse moments',                  '⚡', 'presence'),
  ('night_regular',   'Night Owl II',     'Checked in after midnight 5 times',         '🦉', 'presence'),
  ('first_gallery',   'Photographer',     'Added your first venue photo',              '📸', 'presence')
ON CONFLICT (slug) DO NOTHING;
