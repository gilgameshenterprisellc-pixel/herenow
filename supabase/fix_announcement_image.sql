-- Add image_url to venue_announcements (was referenced in code but never added to schema)
ALTER TABLE venue_announcements
  ADD COLUMN IF NOT EXISTS image_url text;
