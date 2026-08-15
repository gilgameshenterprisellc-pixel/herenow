-- Emoji reactions on Pulse posts (Jacob, Aug 2026). Run once.
--
-- "I'm also considering allowing users to add reactions to Pulse posts. Things
-- like likes or emoji reactions would give people a lightweight way to interact
-- with posts and make Pulse feel a little more alive. I don't think we need
-- commenting yet."
--
-- Deliberately reactions only. Comments are a moderation surface and a place for
-- unwanted attention to land on a named person, which is the thing the whole
-- product is built to prevent. A reaction carries no free text.

CREATE TABLE IF NOT EXISTS pulse_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES pulse_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz DEFAULT now(),
  -- One row per person per emoji per post: tapping the same emoji twice removes
  -- it rather than stacking. Also makes the toggle idempotent under a double tap.
  UNIQUE (post_id, user_id, emoji)
);

-- Every read is "all reactions for the posts on screen".
CREATE INDEX IF NOT EXISTS pulse_reactions_post_idx ON pulse_reactions (post_id);

ALTER TABLE pulse_reactions ENABLE ROW LEVEL SECURITY;

-- Visibility rides on the post. The EXISTS runs under the caller's own RLS on
-- pulse_posts, so a reaction is readable exactly when its post is — no separate
-- copy of the check-in rule to keep in sync, and nothing leaks about venues the
-- user isn't in.
DROP POLICY IF EXISTS "Read reactions on visible posts" ON pulse_reactions;
CREATE POLICY "Read reactions on visible posts"
  ON pulse_reactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM pulse_posts p WHERE p.id = pulse_reactions.post_id));

-- You may only ever react as yourself, and only to a post you can see.
DROP POLICY IF EXISTS "React as yourself" ON pulse_reactions;
CREATE POLICY "React as yourself"
  ON pulse_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM pulse_posts p WHERE p.id = pulse_reactions.post_id)
  );

-- Removing a reaction is only ever removing your own.
DROP POLICY IF EXISTS "Remove your own reaction" ON pulse_reactions;
CREATE POLICY "Remove your own reaction"
  ON pulse_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Reactions die with the post they're on (ON DELETE CASCADE above), so they
-- inherit Pulse's ephemerality for free — nothing survives the night.
