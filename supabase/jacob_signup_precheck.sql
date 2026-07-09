-- Signup availability pre-check (July 2026). Run once in Supabase.
--
-- Bug: signup calls supabase.auth.signUp() first, then inserts the profile row.
-- With the unique phone index (jacob_phone_registration.sql) and the unique
-- username constraint, a duplicate value makes the profile insert fail AFTER the
-- auth user already exists. Email confirmation is off, so the person is left
-- signed in with no profile and can never re-register that email. This function
-- lets the client check availability BEFORE creating the auth user.
--
-- SECURITY DEFINER so it can see across all profiles despite RLS. It only returns
-- a status string — never any other user's data.

CREATE OR REPLACE FUNCTION signup_availability(p_phone text, p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_phone IS NOT NULL AND p_phone <> ''
     AND EXISTS (SELECT 1 FROM profiles WHERE phone = p_phone) THEN
    RETURN 'phone_taken';
  END IF;

  IF p_username IS NOT NULL AND p_username <> ''
     AND EXISTS (SELECT 1 FROM profiles WHERE username = p_username) THEN
    RETURN 'username_taken';
  END IF;

  RETURN 'ok';
END;
$$;

-- Callable before login (anon) and after (authenticated).
GRANT EXECUTE ON FUNCTION signup_availability(text, text) TO anon, authenticated;
