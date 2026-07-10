-- Venue banner/avatar upload RLS fix (Jacob feedback 6). Run once in Supabase.
--
-- Bug: uploading a venue banner or profile photo in Edit Venue failed with
-- "new row violates row-level security policy". The photos upload to the
-- 'avatars' storage bucket (app/venue/edit.tsx), but that bucket had no INSERT
-- policy for authenticated users, so storage.objects rejected the write.
--
-- Fix: ensure the bucket exists + is public (photos are shown publicly), and let
-- any authenticated user upload/update objects in it, with public read.

-- 1. Bucket exists and is public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Authenticated users can upload into the avatars bucket.
DROP POLICY IF EXISTS "Authenticated upload avatars" ON storage.objects;
CREATE POLICY "Authenticated upload avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- 3. Authenticated users can overwrite (upsert: true re-uploads to same path).
DROP POLICY IF EXISTS "Authenticated update avatars" ON storage.objects;
CREATE POLICY "Authenticated update avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

-- 4. Anyone can read (images are displayed in the app + on public venue pages).
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
