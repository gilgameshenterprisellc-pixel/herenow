-- Search venues by name OR any of their Vibe chips (Jacob/Alex, build 8).
-- Run once in Supabase.
--
-- Alex wants a user to type a signature item like "Espresso Martini" and find
-- the venue that tagged it. The old search only matched the venue name. This
-- matches the name and any chip, case-insensitive and partial. Not SECURITY
-- DEFINER, so the existing zones SELECT RLS still applies.

CREATE OR REPLACE FUNCTION search_venues(q text)
RETURNS SETOF zones
LANGUAGE sql STABLE
AS $$
  SELECT z.*
  FROM zones z
  WHERE z.is_active = true
    AND (
      z.name ILIKE '%' || q || '%'
      OR EXISTS (SELECT 1 FROM unnest(z.chips) c WHERE c ILIKE '%' || q || '%')
    )
  ORDER BY z.name
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION search_venues(text) TO anon, authenticated;
