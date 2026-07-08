-- Photo-first Pulse (Jacob Q3/Q4). Run once in Supabase SQL editor.

-- 1. Pin + venue-post flags on pulse_posts (media_url + is_hidden already exist)
ALTER TABLE pulse_posts ADD COLUMN IF NOT EXISTS is_pinned     BOOLEAN DEFAULT FALSE;
ALTER TABLE pulse_posts ADD COLUMN IF NOT EXISTS is_venue_post BOOLEAN DEFAULT FALSE;

-- 2. Report → auto-hide: a flagged Pulse photo / chat message disappears for
--    everyone immediately, pending admin review (Jacob: err on the side of
--    caution). Free reactive moderation — no external API required.
CREATE OR REPLACE FUNCTION report_content_auto_hide(
  p_content_type text,   -- 'pulse_post' | 'chat_message'
  p_content_id   uuid,
  p_zone_id      uuid,
  p_reason       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  INSERT INTO content_reports (reporter_id, zone_id, content_type, content_id, reason)
  VALUES (auth.uid(), p_zone_id, p_content_type, p_content_id, p_reason);

  IF p_content_type = 'pulse_post' THEN
    UPDATE pulse_posts SET is_hidden = true WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_message' THEN
    UPDATE venue_chat  SET is_hidden = true WHERE id = p_content_id;
  END IF;
END $$;

-- Admin: to un-hide reviewed content:
--   UPDATE pulse_posts SET is_hidden = false WHERE id = '<id>';
