-- ═══════════════════════════════════════════════════════════════════════════
-- ORGANIZATIONS (Jacob, July 16 2026). Run once in Supabase.
--
-- "My buddy runs a backgammon meetup league at a bar. It would be valuable
-- for him to run it through HereNow — promote and market to the people that
-- are members, and acquire data on it like a venue does."
--
-- An organization is a club/league/brand/community run by a regular user
-- account, homed at a host venue. Members join the org; the org posts
-- announcements to members and creates events at its host venue. The owner
-- gets venue-style basics: member count, event RSVPs, announcement reach.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Organizations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text DEFAULT NULL,
  category     text NOT NULL DEFAULT 'community'
                 CHECK (category IN ('club','league','community','brand','creators','other')),
  host_zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  -- active for beta (instant creation); admin can suspend a bad actor.
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizations_zone ON organizations (host_zone_id);

-- ── 2. Members ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_members (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- ── 3. Announcements (members-only feed) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organization_posts ON organization_posts (org_id, created_at DESC);

-- ── 4. Org events ride the existing venue_events table ───────────────────────
-- An org event is a normal venue event tagged with the org — it shows on the
-- venue's Events tab like any other, plus on the org page.
ALTER TABLE venue_events ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_posts   ENABLE ROW LEVEL SECURITY;

-- Orgs are publicly discoverable (they exist to be found at their venue).
DROP POLICY IF EXISTS "Organizations viewable by everyone" ON organizations;
CREATE POLICY "Organizations viewable by everyone" ON organizations FOR SELECT
  USING (status = 'active' OR owner_id = auth.uid());
DROP POLICY IF EXISTS "Users create organizations" ON organizations;
CREATE POLICY "Users create organizations" ON organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Owners update organizations" ON organizations;
CREATE POLICY "Owners update organizations" ON organizations FOR UPDATE
  USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "Owners delete organizations" ON organizations;
CREATE POLICY "Owners delete organizations" ON organizations FOR DELETE
  USING (owner_id = auth.uid());

-- Membership is private: you see your own rows; the org owner sees their
-- member list. Public counts come from the RPC below.
DROP POLICY IF EXISTS "Own membership" ON organization_members;
CREATE POLICY "Own membership" ON organization_members FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Org owner sees members" ON organization_members;
CREATE POLICY "Org owner sees members" ON organization_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM organizations o
                 WHERE o.id = organization_members.org_id AND o.owner_id = auth.uid()));

-- Announcements: members + owner read; owner writes.
DROP POLICY IF EXISTS "Members read org posts" ON organization_posts;
CREATE POLICY "Members read org posts" ON organization_posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members m
          WHERE m.org_id = organization_posts.org_id AND m.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM organizations o
             WHERE o.id = organization_posts.org_id AND o.owner_id = auth.uid())
);
DROP POLICY IF EXISTS "Owner writes org posts" ON organization_posts;
CREATE POLICY "Owner writes org posts" ON organization_posts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM organizations o
          WHERE o.id = organization_posts.org_id AND o.owner_id = auth.uid())
);
DROP POLICY IF EXISTS "Owner deletes org posts" ON organization_posts;
CREATE POLICY "Owner deletes org posts" ON organization_posts FOR DELETE USING (
  EXISTS (SELECT 1 FROM organizations o
          WHERE o.id = organization_posts.org_id AND o.owner_id = auth.uid())
);

-- ── 6. Public member count (membership rows stay private) ────────────────────
CREATE OR REPLACE FUNCTION org_member_count(p_org uuid)
RETURNS int LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT count(*)::int FROM organization_members WHERE org_id = p_org;
$$;

-- ── 7. Member ids for announcement fan-out (owner-only) ──────────────────────
-- The owner already has SELECT on their member rows via RLS; this exists so
-- the app can notify members without pulling profile data it doesn't need.
CREATE OR REPLACE FUNCTION org_member_ids(p_org uuid)
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT m.user_id FROM organization_members m
  WHERE m.org_id = p_org
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p_org AND o.owner_id = auth.uid());
$$;
