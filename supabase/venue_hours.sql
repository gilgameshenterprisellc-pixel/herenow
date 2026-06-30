-- Simple text field for operating hours (e.g. "Mon-Thu 5pm-2am · Fri-Sat 3pm-3am")
ALTER TABLE zones ADD COLUMN IF NOT EXISTS opening_hours text;
