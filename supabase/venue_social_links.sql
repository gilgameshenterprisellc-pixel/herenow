-- Venue social links (Jacob, Oct 28): optional links to a venue's Instagram,
-- Facebook, TikTok, X and website, shown as small icons on its profile.
--
-- zones.social_links is the one place a venue's links live:
--   {"instagram": "https://www.instagram.com/x", "website": "https://x.com", ...}
-- Only full URLs are stored; the app turns a typed handle into one
-- (lib/socialLinks.ts) and re-checks every link before showing it.
--
-- profiles.venue_social_links only holds what a venue typed at SIGNUP, while
-- it is still pending and has no zone. The trigger below copies it onto the
-- zone when the zone is created or claimed, whoever creates it (admin
-- approval, a submission, or the owner's own setup screen), so no approval
-- function has to change. After that the profile copy is never read again.
--
-- The app reads both columns in their own queries and treats an error as
-- "not set up yet", so a build that ships before this runs degrades to no
-- links instead of breaking the venue page or signup. Safe to re-run.

ALTER TABLE zones    ADD COLUMN IF NOT EXISTS social_links       jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS venue_social_links jsonb;

-- Never a list, string or number: the app expects an object.
ALTER TABLE zones DROP CONSTRAINT IF EXISTS zones_social_links_is_object;
ALTER TABLE zones ADD CONSTRAINT zones_social_links_is_object
  CHECK (jsonb_typeof(social_links) = 'object');

-- Copy signup links onto the venue when it gets its zone. Only fills an empty
-- social_links, so links set on the zone itself always win. SECURITY DEFINER
-- because whoever creates the zone (often an admin) may not be able to read
-- the owner's profile row under RLS; it reads that one column only.
CREATE OR REPLACE FUNCTION zones_seed_social_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_links jsonb;
BEGIN
  IF NEW.owner_id IS NULL
     OR (NEW.social_links IS NOT NULL AND NEW.social_links <> '{}'::jsonb) THEN
    RETURN NEW;
  END IF;

  SELECT venue_social_links INTO v_links FROM profiles WHERE id = NEW.owner_id;
  IF v_links IS NOT NULL AND jsonb_typeof(v_links) = 'object' THEN
    NEW.social_links := v_links;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zones_seed_social_links_trg ON zones;
CREATE TRIGGER zones_seed_social_links_trg
  BEFORE INSERT OR UPDATE OF owner_id ON zones
  FOR EACH ROW
  EXECUTE FUNCTION zones_seed_social_links();

-- Tell PostgREST about the new columns now rather than at its next reload.
NOTIFY pgrst, 'reload schema';

-- Check: both columns exist.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'zones' AND column_name = 'social_links')
   OR (table_name = 'profiles' AND column_name = 'venue_social_links');
