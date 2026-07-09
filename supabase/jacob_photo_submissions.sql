-- Gallery photo submissions (Jacob #9). Run once in Supabase.
--
-- Problem: the only INSERT policy on venue_photos was "Zone owner can upload",
-- so a checked-in patron submitting a photo (Alex) was silently blocked by RLS —
-- the photo never saved, so there was nowhere to accept it. Fix: let checked-in
-- users submit PENDING photos, and let the venue owner approve/reject.

-- 1. Checked-in patrons can submit a pending photo to the venue they're in.
DROP POLICY IF EXISTS "Checked-in users submit pending photos" ON venue_photos;
CREATE POLICY "Checked-in users submit pending photos"
  ON venue_photos FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.zone_id = venue_photos.zone_id
        AND s.user_id = auth.uid()
        AND s.is_active = true
    )
  );

-- 2. Zone owner can approve/reject (update status).
DROP POLICY IF EXISTS "Zone owner updates photo status" ON venue_photos;
CREATE POLICY "Zone owner updates photo status"
  ON venue_photos FOR UPDATE
  USING (EXISTS (SELECT 1 FROM zones WHERE id = venue_photos.zone_id AND owner_id = auth.uid()));
