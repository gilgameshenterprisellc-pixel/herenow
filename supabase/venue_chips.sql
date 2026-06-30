-- Venue amenity / vibe chips — venues select descriptive tags shown on cards and in search
ALTER TABLE zones ADD COLUMN IF NOT EXISTS chips text[] DEFAULT '{}';
