-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE CONTESTS (Oct 2026). Run once in the Supabase SQL editor. Safe to re-run.
--
-- Jacob is talking to Monster about sponsoring a mechanical bull night at
-- Skinny Dennis: sign up in the app, a live leaderboard, and someone running it
-- in real time. Built general on purpose, so a bull night, a darts league, a
-- trivia night or a beer pong bracket are all the same thing with different
-- words on it.
--
-- HereNow has no over-the-air updates, so the app ships one contest screen that
-- renders whatever a row here says. Creating, customizing and running a contest
-- is all data; none of it ever needs a new build.
--
-- Roles:
--   manager   the contest's creator, the venue owner, the presenting org's
--             owner, or an admin. Edits settings and adds operators.
--   operator  anyone a manager adds by username (the brand rep, bar staff).
--             Runs it live: signups, calling people up, scores.
--   entrant   a signed-in person checked in at the venue.
--
-- Every write goes through a function below, never a direct insert or update,
-- so each action happens completely or not at all. Every write also bumps
-- contests.version. Open screens listen to that one row over Realtime and reload
-- the whole board in one call (contest_board), so everyone sees the same state.
--
-- Apple Guideline 5.3.2: the official rules have to be in the app and say Apple
-- is not involved. The app adds that line to every contest's Rules sheet.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id            uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  -- The presenting org (a brand like Monster), when an org owner made it.
  org_id             uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- What people see. All host-written.
  title              text NOT NULL,
  tagline            text,
  presented_by       text,                  -- "Monster Energy"
  logo_url           text,
  banner_url         text,
  accent_color       text NOT NULL DEFAULT '#29B6F6',
  rules              text,
  prizes             text,
  starts_at          timestamptz,

  -- How it is scored. 7.42 with suffix 's' and 2 decimals reads "7.42s".
  score_label        text NOT NULL DEFAULT 'Score',   -- "Ride time"
  score_suffix       text NOT NULL DEFAULT '',        -- "s", "pts"
  score_decimals     int  NOT NULL DEFAULT 0,
  higher_wins        boolean NOT NULL DEFAULT true,
  attempts_per_entry int  NOT NULL DEFAULT 1,
  max_entries        int,

  -- Live state.
  status             text NOT NULL DEFAULT 'draft',
  signups_open       boolean NOT NULL DEFAULT false,
  -- A contest an org made stays invisible until the venue owner approves it.
  venue_approved     boolean NOT NULL DEFAULT false,
  now_up_entry_id    uuid,
  ticker             text,                  -- one line from the operator
  entry_count        int  NOT NULL DEFAULT 0,
  ended_at           timestamptz,
  version            bigint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contests_status_check CHECK (status IN ('draft','scheduled','live','paused','ended','hidden')),
  CONSTRAINT contests_title_len    CHECK (char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT contests_tagline_len  CHECK (tagline IS NULL OR char_length(tagline) <= 140),
  CONSTRAINT contests_presented_len CHECK (presented_by IS NULL OR char_length(presented_by) <= 60),
  CONSTRAINT contests_rules_len    CHECK (rules IS NULL OR char_length(rules) <= 4000),
  CONSTRAINT contests_prizes_len   CHECK (prizes IS NULL OR char_length(prizes) <= 1000),
  CONSTRAINT contests_ticker_len   CHECK (ticker IS NULL OR char_length(ticker) <= 140),
  CONSTRAINT contests_accent_hex   CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT contests_label_len    CHECK (char_length(score_label) BETWEEN 1 AND 24),
  CONSTRAINT contests_suffix_len   CHECK (char_length(score_suffix) <= 8),
  CONSTRAINT contests_decimals     CHECK (score_decimals BETWEEN 0 AND 3),
  CONSTRAINT contests_attempts     CHECK (attempts_per_entry BETWEEN 1 AND 10),
  CONSTRAINT contests_max_entries  CHECK (max_entries IS NULL OR max_entries BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS idx_contests_zone ON contests (zone_id, status);
CREATE INDEX IF NOT EXISTS idx_contests_org  ON contests (org_id);

CREATE TABLE IF NOT EXISTS contest_operators (
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_contest_operators_user ON contest_operators (user_id);

CREATE TABLE IF NOT EXISTS contest_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- "Jordan P.", taken at signup, the same short form People cards use.
  display_name  text NOT NULL,
  status        text NOT NULL DEFAULT 'waiting',
  queue_no      int  NOT NULL,
  attempts_used int  NOT NULL DEFAULT 0,
  best_score    numeric(14,3),
  best_at       timestamptz,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contest_entries_status_check
    CHECK (status IN ('waiting','up','done','no_show','withdrawn','removed')),
  UNIQUE (contest_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_contest_entries_line ON contest_entries (contest_id, status, queue_no);

CREATE TABLE IF NOT EXISTS contest_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id  uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  entry_id    uuid NOT NULL REFERENCES contest_entries(id) ON DELETE CASCADE,
  score       numeric(14,3) NOT NULL,
  voided      boolean NOT NULL DEFAULT false,
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contest_attempts_entry ON contest_attempts (entry_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_now_up_fk') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_now_up_fk
      FOREIGN KEY (now_up_entry_id) REFERENCES contest_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2. Who may do what ───────────────────────────────────────────────────────
-- SECURITY DEFINER so the policies below can ask without tripping over each
-- other's RLS. Each answers only about the caller (auth.uid()).

CREATE OR REPLACE FUNCTION contest_can_manage(p_contest uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM contests c
    WHERE c.id = p_contest AND (
      c.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM zones z WHERE z.id = c.zone_id AND z.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = c.org_id AND o.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    )
  ), false)
$$;

CREATE OR REPLACE FUNCTION contest_can_operate(p_contest uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT contest_can_manage(p_contest) OR COALESCE(EXISTS (
    SELECT 1 FROM contest_operators o
    WHERE o.contest_id = p_contest AND o.user_id = auth.uid()
  ), false)
$$;

-- The same "Jordan P." rule as publicName() in lib/format.ts.
CREATE OR REPLACE FUNCTION contest_public_name(p_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE parts text[];
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN RETURN 'Someone'; END IF;
  parts := regexp_split_to_array(btrim(p_name), '\s+');
  IF array_length(parts, 1) = 1 THEN RETURN parts[1]; END IF;
  RETURN parts[1] || ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.';
END $$;

-- ── 3. Row level security: read-only from the client ─────────────────────────
ALTER TABLE contests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_attempts  ENABLE ROW LEVEL SECURITY;

-- An approved contest that isn't a draft or switched off is visible to anyone
-- signed in, so it can show on the venue page. The people in it are not: the
-- leaderboard comes from contest_board(), which checks you are at the venue.
DROP POLICY IF EXISTS "Contests visible" ON contests;
CREATE POLICY "Contests visible" ON contests FOR SELECT TO authenticated
  USING ((venue_approved AND status NOT IN ('draft','hidden')) OR contest_can_operate(id));

DROP POLICY IF EXISTS "Contest operators visible" ON contest_operators;
CREATE POLICY "Contest operators visible" ON contest_operators FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR contest_can_manage(contest_id));

DROP POLICY IF EXISTS "Contest entries visible" ON contest_entries;
CREATE POLICY "Contest entries visible" ON contest_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR contest_can_operate(contest_id));

DROP POLICY IF EXISTS "Contest attempts visible" ON contest_attempts;
CREATE POLICY "Contest attempts visible" ON contest_attempts FOR SELECT TO authenticated
  USING (
    contest_can_operate(contest_id)
    OR EXISTS (SELECT 1 FROM contest_entries e WHERE e.id = entry_id AND e.user_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies: every write is one of the functions below.

-- ── 4. Internal helpers (not callable from the app) ──────────────────────────

-- Every write ends here: open screens hear this row change and reload.
CREATE OR REPLACE FUNCTION contest_touch(p_contest uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE contests SET version = version + 1, updated_at = now() WHERE id = p_contest;
$$;

-- Recount the people actually in it (not withdrawn or removed).
CREATE OR REPLACE FUNCTION contest_recount(p_contest uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE contests SET entry_count = (
    SELECT count(*) FROM contest_entries
    WHERE contest_id = p_contest AND status NOT IN ('withdrawn','removed')
  ) WHERE id = p_contest;
$$;

-- Best score and attempts from the attempts that still count. A tie goes to
-- whoever got there first.
CREATE OR REPLACE FUNCTION contest_recompute_entry(p_entry uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_higher boolean;
  v_n      int;
  v_best   numeric;
  v_at     timestamptz;
BEGIN
  SELECT c.higher_wins INTO v_higher
  FROM contest_entries e JOIN contests c ON c.id = e.contest_id
  WHERE e.id = p_entry;

  SELECT count(*) INTO v_n FROM contest_attempts
  WHERE entry_id = p_entry AND NOT voided;

  SELECT a.score, a.created_at INTO v_best, v_at
  FROM contest_attempts a
  WHERE a.entry_id = p_entry AND NOT a.voided
  ORDER BY CASE WHEN v_higher THEN -a.score ELSE a.score END, a.created_at
  LIMIT 1;

  UPDATE contest_entries
  SET attempts_used = v_n, best_score = v_best, best_at = v_at, updated_at = now()
  WHERE id = p_entry;
END $$;

-- The end of the line, for someone going round again.
CREATE OR REPLACE FUNCTION contest_next_queue_no(p_contest uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(max(queue_no), 0) + 1 FROM contest_entries WHERE contest_id = p_contest;
$$;

REVOKE ALL ON FUNCTION contest_touch(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION contest_recount(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION contest_recompute_entry(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION contest_next_queue_no(uuid)    FROM PUBLIC, anon, authenticated;

-- ── 5. Hosts: create, edit, approve, operators, delete ───────────────────────

-- Create (p_contest NULL) or edit. Only the keys present in p are changed.
-- Who may create: the venue owner, an admin, or the owner of an org whose host
-- venue this is (the same rule as events). An org's contest waits for the venue.
CREATE OR REPLACE FUNCTION contest_save(p_contest uuid, p_zone uuid, p_org uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_admin    boolean;
  v_owner    boolean;
  v_id       uuid;
  v_c        contests%ROWTYPE;
  v_attempts boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND is_banned) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  SELECT COALESCE(is_admin, false) INTO v_admin FROM profiles WHERE id = v_uid;
  v_admin := COALESCE(v_admin, false);

  IF p_contest IS NULL THEN
    IF p_zone IS NULL THEN RAISE EXCEPTION 'no_venue'; END IF;
    v_owner := EXISTS (SELECT 1 FROM zones WHERE id = p_zone AND owner_id = v_uid);
    IF p_org IS NOT NULL AND NOT v_admin AND NOT EXISTS (
      SELECT 1 FROM organizations
      WHERE id = p_org AND owner_id = v_uid AND host_zone_id = p_zone AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
    IF NOT (v_owner OR v_admin OR p_org IS NOT NULL) THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
    IF NULLIF(btrim(p->>'title'), '') IS NULL THEN RAISE EXCEPTION 'title_required'; END IF;

    INSERT INTO contests (zone_id, org_id, created_by, title, venue_approved)
    VALUES (p_zone, p_org, v_uid, btrim(p->>'title'), v_owner OR v_admin)
    RETURNING id INTO v_id;
  ELSE
    IF NOT contest_can_manage(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
    v_id := p_contest;
  END IF;

  SELECT * INTO v_c FROM contests WHERE id = v_id FOR UPDATE;

  -- Flipping who wins after scores exist would silently reorder the board.
  IF p ? 'higher_wins' AND (p->>'higher_wins')::boolean IS DISTINCT FROM v_c.higher_wins THEN
    v_attempts := EXISTS (SELECT 1 FROM contest_attempts WHERE contest_id = v_id AND NOT voided);
    IF v_attempts THEN RAISE EXCEPTION 'scoring_locked'; END IF;
  END IF;

  UPDATE contests SET
    title              = CASE WHEN p ? 'title' THEN COALESCE(NULLIF(btrim(p->>'title'), ''), title) ELSE title END,
    tagline            = CASE WHEN p ? 'tagline'      THEN NULLIF(btrim(p->>'tagline'), '')      ELSE tagline END,
    presented_by       = CASE WHEN p ? 'presented_by' THEN NULLIF(btrim(p->>'presented_by'), '') ELSE presented_by END,
    logo_url           = CASE WHEN p ? 'logo_url'     THEN NULLIF(btrim(p->>'logo_url'), '')     ELSE logo_url END,
    banner_url         = CASE WHEN p ? 'banner_url'   THEN NULLIF(btrim(p->>'banner_url'), '')   ELSE banner_url END,
    accent_color       = CASE WHEN p ? 'accent_color' THEN COALESCE(NULLIF(btrim(p->>'accent_color'), ''), accent_color) ELSE accent_color END,
    rules              = CASE WHEN p ? 'rules'        THEN NULLIF(btrim(p->>'rules'), '')        ELSE rules END,
    prizes             = CASE WHEN p ? 'prizes'       THEN NULLIF(btrim(p->>'prizes'), '')       ELSE prizes END,
    starts_at          = CASE WHEN p ? 'starts_at'    THEN NULLIF(p->>'starts_at', '')::timestamptz ELSE starts_at END,
    score_label        = CASE WHEN p ? 'score_label'  THEN COALESCE(NULLIF(btrim(p->>'score_label'), ''), 'Score') ELSE score_label END,
    score_suffix       = CASE WHEN p ? 'score_suffix' THEN COALESCE(btrim(p->>'score_suffix'), '') ELSE score_suffix END,
    score_decimals     = CASE WHEN p ? 'score_decimals'     THEN (p->>'score_decimals')::int     ELSE score_decimals END,
    higher_wins        = CASE WHEN p ? 'higher_wins'        THEN (p->>'higher_wins')::boolean    ELSE higher_wins END,
    attempts_per_entry = CASE WHEN p ? 'attempts_per_entry' THEN (p->>'attempts_per_entry')::int ELSE attempts_per_entry END,
    max_entries        = CASE WHEN p ? 'max_entries'  THEN NULLIF(p->>'max_entries', '')::int ELSE max_entries END,
    status             = CASE WHEN p ? 'status' AND p->>'status' IN ('draft','scheduled')
                              AND status IN ('draft','scheduled') THEN p->>'status' ELSE status END
  WHERE id = v_id;

  PERFORM contest_touch(v_id);
  RETURN v_id;
END $$;

-- The venue owner says yes (or no) to a contest an org wants to run there.
CREATE OR REPLACE FUNCTION contest_approve(p_contest uuid, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM contests c JOIN zones z ON z.id = c.zone_id
    WHERE c.id = p_contest AND z.owner_id = auth.uid()
  ) AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  UPDATE contests SET venue_approved = p_approved WHERE id = p_contest;
  PERFORM contest_touch(p_contest);
END $$;

CREATE OR REPLACE FUNCTION contest_add_operator(p_contest uuid, p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p profiles%ROWTYPE;
BEGIN
  IF NOT contest_can_manage(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO v_p FROM profiles
  WHERE lower(username) = lower(btrim(ltrim(btrim(COALESCE(p_username, '')), '@')))
  LIMIT 1;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF COALESCE(v_p.is_banned, false) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO contest_operators (contest_id, user_id, added_by)
  VALUES (p_contest, v_p.id, auth.uid())
  ON CONFLICT (contest_id, user_id) DO NOTHING;
  PERFORM contest_touch(p_contest);
  RETURN jsonb_build_object('user_id', v_p.id, 'display_name', v_p.display_name, 'username', v_p.username);
END $$;

CREATE OR REPLACE FUNCTION contest_remove_operator(p_contest uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT contest_can_manage(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  DELETE FROM contest_operators WHERE contest_id = p_contest AND user_id = p_user;
  PERFORM contest_touch(p_contest);
END $$;

CREATE OR REPLACE FUNCTION contest_delete(p_contest uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT contest_can_manage(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  DELETE FROM contests WHERE id = p_contest;
END $$;

-- ── 6. Operators: run it live ────────────────────────────────────────────────

-- scheduled → live → paused → ended, plus 'hidden' as the kill switch: it takes
-- the contest off every screen at once if something goes wrong mid-event.
CREATE OR REPLACE FUNCTION contest_set_status(p_contest uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c contests%ROWTYPE;
BEGIN
  IF NOT contest_can_operate(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_status NOT IN ('draft','scheduled','live','paused','ended','hidden') THEN
    RAISE EXCEPTION 'bad_status';
  END IF;
  SELECT * INTO v_c FROM contests WHERE id = p_contest FOR UPDATE;

  IF p_status = 'ended' THEN
    -- Whoever was called up but never got a score goes back in line, so
    -- reopening the contest picks up where it left off.
    UPDATE contest_entries SET status = 'waiting', updated_at = now()
    WHERE contest_id = p_contest AND status = 'up';
    UPDATE contests SET status = 'ended', ended_at = now(), signups_open = false,
           now_up_entry_id = NULL
    WHERE id = p_contest;
  ELSE
    UPDATE contests SET status = p_status,
           ended_at = CASE WHEN p_status = 'hidden' THEN ended_at ELSE NULL END
    WHERE id = p_contest;
  END IF;

  PERFORM contest_touch(p_contest);
END $$;

CREATE OR REPLACE FUNCTION contest_set_signups(p_contest uuid, p_open boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT contest_can_operate(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  UPDATE contests SET signups_open = p_open WHERE id = p_contest;
  PERFORM contest_touch(p_contest);
END $$;

CREATE OR REPLACE FUNCTION contest_set_ticker(p_contest uuid, p_text text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT contest_can_operate(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  UPDATE contests SET ticker = NULLIF(left(btrim(COALESCE(p_text, '')), 140), '')
  WHERE id = p_contest;
  PERFORM contest_touch(p_contest);
END $$;

-- Call someone up: a specific entry, or the next person in line. Calling also
-- starts the contest if it was scheduled or paused, because a call means it is
-- running. Returns who was called and who is on deck so the console can send
-- the "you're up" and "you're on deck" notifications.
CREATE OR REPLACE FUNCTION contest_call(p_contest uuid, p_entry uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c       contests%ROWTYPE;
  v_prev    uuid;
  v_target  contest_entries%ROWTYPE;
  v_deck    contest_entries%ROWTYPE;
BEGIN
  IF NOT contest_can_operate(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO v_c FROM contests WHERE id = p_contest FOR UPDATE;
  IF v_c.status IN ('draft','ended','hidden') THEN RAISE EXCEPTION 'not_running'; END IF;

  -- Whoever is up now and hasn't been scored goes back to their place in line.
  v_prev := v_c.now_up_entry_id;
  IF v_prev IS NOT NULL THEN
    UPDATE contest_entries SET status = 'waiting', updated_at = now()
    WHERE id = v_prev AND status = 'up';
  END IF;

  IF p_entry IS NOT NULL THEN
    SELECT * INTO v_target FROM contest_entries
    WHERE id = p_entry AND contest_id = p_contest
      AND status IN ('waiting','up','no_show','done')
      AND attempts_used < v_c.attempts_per_entry;
    IF v_target.id IS NULL THEN RAISE EXCEPTION 'cannot_call'; END IF;
  ELSE
    SELECT * INTO v_target FROM contest_entries
    WHERE contest_id = p_contest AND status = 'waiting'
      AND attempts_used < v_c.attempts_per_entry
      AND id IS DISTINCT FROM v_prev
    ORDER BY queue_no LIMIT 1;
  END IF;

  IF v_target.id IS NULL THEN
    UPDATE contests SET now_up_entry_id = NULL WHERE id = p_contest;
    PERFORM contest_touch(p_contest);
    RETURN jsonb_build_object('called', NULL);
  END IF;

  UPDATE contest_entries SET status = 'up', updated_at = now() WHERE id = v_target.id;
  UPDATE contests SET now_up_entry_id = v_target.id,
         status = CASE WHEN status IN ('scheduled','paused') THEN 'live' ELSE status END
  WHERE id = p_contest;

  SELECT * INTO v_deck FROM contest_entries
  WHERE contest_id = p_contest AND status = 'waiting'
    AND attempts_used < v_c.attempts_per_entry
  ORDER BY queue_no LIMIT 1;

  PERFORM contest_touch(p_contest);
  RETURN jsonb_build_object(
    'called', jsonb_build_object('entry_id', v_target.id, 'user_id', v_target.user_id,
                                 'display_name', v_target.display_name),
    'on_deck', CASE WHEN v_deck.id IS NULL THEN NULL ELSE
      jsonb_build_object('entry_id', v_deck.id, 'user_id', v_deck.user_id,
                         'display_name', v_deck.display_name) END,
    'title', v_c.title,
    'zone_id', v_c.zone_id
  );
END $$;

-- Record a score. With attempts left, the person goes to the end of the line
-- for the next round; otherwise they're done.
CREATE OR REPLACE FUNCTION contest_record_score(p_contest uuid, p_entry uuid, p_score numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c contests%ROWTYPE;
  v_e contest_entries%ROWTYPE;
BEGIN
  IF NOT contest_can_operate(p_contest) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_score IS NULL OR p_score = 'NaN'::numeric OR abs(p_score) >= 100000000000 THEN
    RAISE EXCEPTION 'bad_score';
  END IF;
  SELECT * INTO v_c FROM contests WHERE id = p_contest FOR UPDATE;
  IF v_c.status IN ('draft','hidden') THEN RAISE EXCEPTION 'not_running'; END IF;
  SELECT * INTO v_e FROM contest_entries WHERE id = p_entry AND contest_id = p_contest FOR UPDATE;
  IF v_e.id IS NULL OR v_e.status IN ('withdrawn','removed') THEN RAISE EXCEPTION 'cannot_score'; END IF;
  -- An operator who is also in the contest can't score, fix or void their own
  -- turn; another operator has to. Prizes ride on this.
  IF v_e.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_score_self'; END IF;
  IF v_e.attempts_used >= v_c.attempts_per_entry THEN RAISE EXCEPTION 'no_attempts_left'; END IF;

  INSERT INTO contest_attempts (contest_id, entry_id, score, recorded_by)
  VALUES (p_contest, p_entry, round(p_score, v_c.score_decimals), auth.uid());

  PERFORM contest_recompute_entry(p_entry);
  SELECT * INTO v_e FROM contest_entries WHERE id = p_entry;

  IF v_e.attempts_used >= v_c.attempts_per_entry THEN
    UPDATE contest_entries SET status = 'done', updated_at = now() WHERE id = p_entry;
  ELSE
    UPDATE contest_entries SET status = 'waiting', queue_no = contest_next_queue_no(p_contest),
           updated_at = now()
    WHERE id = p_entry;
  END IF;

  IF v_c.now_up_entry_id = p_entry THEN
    UPDATE contests SET now_up_entry_id = NULL WHERE id = p_contest;
  END IF;

  PERFORM contest_touch(p_contest);
  RETURN jsonb_build_object('user_id', v_e.user_id, 'best_score', v_e.best_score,
                            'attempts_used', v_e.attempts_used);
END $$;

-- Fix a mistyped score.
CREATE OR REPLACE FUNCTION contest_edit_attempt(p_attempt uuid, p_score numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a contest_attempts%ROWTYPE; v_dec int;
BEGIN
  SELECT * INTO v_a FROM contest_attempts WHERE id = p_attempt;
  IF v_a.id IS NULL OR NOT contest_can_operate(v_a.contest_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF EXISTS (SELECT 1 FROM contest_entries WHERE id = v_a.entry_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'cannot_score_self';
  END IF;
  IF p_score IS NULL OR p_score = 'NaN'::numeric OR abs(p_score) >= 100000000000 THEN
    RAISE EXCEPTION 'bad_score';
  END IF;
  SELECT score_decimals INTO v_dec FROM contests WHERE id = v_a.contest_id;
  UPDATE contest_attempts SET score = round(p_score, v_dec), updated_at = now() WHERE id = p_attempt;
  PERFORM contest_recompute_entry(v_a.entry_id);
  PERFORM contest_touch(v_a.contest_id);
END $$;

-- Throw out an attempt (a bull malfunction, a duplicate). A finished entrant
-- with an attempt back goes to the end of the line for their re-ride.
CREATE OR REPLACE FUNCTION contest_void_attempt(p_attempt uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a contest_attempts%ROWTYPE; v_cap int; v_e contest_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM contest_attempts WHERE id = p_attempt;
  IF v_a.id IS NULL OR NOT contest_can_operate(v_a.contest_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF EXISTS (SELECT 1 FROM contest_entries WHERE id = v_a.entry_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'cannot_score_self';
  END IF;
  PERFORM 1 FROM contests WHERE id = v_a.contest_id FOR UPDATE;
  UPDATE contest_attempts SET voided = true, updated_at = now() WHERE id = p_attempt;
  PERFORM contest_recompute_entry(v_a.entry_id);

  SELECT attempts_per_entry INTO v_cap FROM contests WHERE id = v_a.contest_id;
  SELECT * INTO v_e FROM contest_entries WHERE id = v_a.entry_id;
  IF v_e.status = 'done' AND v_e.attempts_used < v_cap THEN
    UPDATE contest_entries SET status = 'waiting',
           queue_no = contest_next_queue_no(v_a.contest_id), updated_at = now()
    WHERE id = v_e.id;
  END IF;
  PERFORM contest_touch(v_a.contest_id);
END $$;

-- Skip a no-show, put someone back in line, or remove someone outright.
-- Removed people drop off the board and can't sign up again.
CREATE OR REPLACE FUNCTION contest_set_entry_status(p_entry uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e contest_entries%ROWTYPE; v_cap int;
BEGIN
  SELECT * INTO v_e FROM contest_entries WHERE id = p_entry;
  IF v_e.id IS NULL OR NOT contest_can_operate(v_e.contest_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_status NOT IN ('waiting','no_show','removed') THEN RAISE EXCEPTION 'bad_status'; END IF;
  PERFORM 1 FROM contests WHERE id = v_e.contest_id FOR UPDATE;

  IF p_status = 'waiting' THEN
    SELECT attempts_per_entry INTO v_cap FROM contests WHERE id = v_e.contest_id;
    -- Back in line only makes sense with an attempt left; otherwise they're done.
    UPDATE contest_entries
    SET status = CASE WHEN attempts_used >= v_cap THEN 'done' ELSE 'waiting' END,
        updated_at = now()
    WHERE id = p_entry;
  ELSIF v_e.user_id = auth.uid() THEN
    -- An operator who is also in the contest, skipping or removing their own
    -- entry, is leaving the line. Same as contest_withdraw: a score already on
    -- the board stays, and they can sign up again. "Removed" is only ever
    -- something another person did to you.
    UPDATE contest_entries
    SET status = CASE WHEN attempts_used > 0 THEN 'done' ELSE 'withdrawn' END,
        updated_at = now()
    WHERE id = p_entry;
  ELSE
    UPDATE contest_entries SET status = p_status, updated_at = now() WHERE id = p_entry;
  END IF;

  -- Whatever happened, the person this was about is no longer the one up.
  UPDATE contests SET now_up_entry_id = NULL
  WHERE id = v_e.contest_id AND now_up_entry_id = p_entry;

  PERFORM contest_recount(v_e.contest_id);
  PERFORM contest_touch(v_e.contest_id);
END $$;

-- ── 7. Entrants ──────────────────────────────────────────────────────────────

-- Sign up. You have to be checked in at the venue right now, which is what
-- makes it an in-the-room thing rather than a web form.
CREATE OR REPLACE FUNCTION contest_join(p_contest uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_c    contests%ROWTYPE;
  v_e    contest_entries%ROWTYPE;
  v_name text;
  v_n    int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  SELECT * INTO v_c FROM contests WHERE id = p_contest FOR UPDATE;
  IF v_c.id IS NULL OR NOT v_c.venue_approved OR v_c.status NOT IN ('scheduled','live','paused') THEN
    RAISE EXCEPTION 'not_open';
  END IF;
  IF NOT v_c.signups_open THEN RAISE EXCEPTION 'signups_closed'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND is_banned) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE user_id = v_uid AND zone_id = v_c.zone_id AND is_active = true AND checked_out_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_checked_in';
  END IF;

  SELECT * INTO v_e FROM contest_entries WHERE contest_id = p_contest AND user_id = v_uid FOR UPDATE;
  IF v_e.id IS NOT NULL AND v_e.status = 'removed' THEN RAISE EXCEPTION 'removed'; END IF;
  IF v_e.id IS NOT NULL AND v_e.status <> 'withdrawn' THEN
    RETURN jsonb_build_object('entry_id', v_e.id, 'already', true);
  END IF;

  SELECT count(*) INTO v_n FROM contest_entries
  WHERE contest_id = p_contest AND status NOT IN ('withdrawn','removed');
  IF v_c.max_entries IS NOT NULL AND v_n >= v_c.max_entries THEN RAISE EXCEPTION 'full'; END IF;

  SELECT contest_public_name(display_name) INTO v_name FROM profiles WHERE id = v_uid;

  IF v_e.id IS NOT NULL THEN
    UPDATE contest_entries SET status = 'waiting', queue_no = contest_next_queue_no(p_contest),
           display_name = COALESCE(v_name, display_name), joined_at = now(), updated_at = now()
    WHERE id = v_e.id;
  ELSE
    INSERT INTO contest_entries (contest_id, user_id, display_name, queue_no)
    VALUES (p_contest, v_uid, COALESCE(v_name, 'Someone'), contest_next_queue_no(p_contest))
    RETURNING * INTO v_e;
  END IF;

  PERFORM contest_recount(p_contest);
  PERFORM contest_touch(p_contest);
  RETURN jsonb_build_object('entry_id', v_e.id, 'already', false);
END $$;

-- Leave the line. Anyone who already has a score keeps it on the board.
CREATE OR REPLACE FUNCTION contest_withdraw(p_contest uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e contest_entries%ROWTYPE;
BEGIN
  PERFORM 1 FROM contests WHERE id = p_contest FOR UPDATE;
  SELECT * INTO v_e FROM contest_entries WHERE contest_id = p_contest AND user_id = auth.uid();
  IF v_e.id IS NULL OR v_e.status NOT IN ('waiting','up','no_show') THEN RETURN; END IF;
  UPDATE contest_entries
  SET status = CASE WHEN attempts_used > 0 THEN 'done' ELSE 'withdrawn' END, updated_at = now()
  WHERE id = v_e.id;
  UPDATE contests SET now_up_entry_id = NULL WHERE id = p_contest AND now_up_entry_id = v_e.id;
  PERFORM contest_recount(p_contest);
  PERFORM contest_touch(p_contest);
END $$;

-- ── 8. The board: everything a screen needs, in one call ─────────────────────
-- Anyone signed in gets the contest itself. The people in it (leaderboard and
-- line) only go to someone checked in at the venue, an operator, or a manager.
-- A name is hidden from you when either of you has blocked the other, the same
-- rule as the rest of the app; operators always see names, since they have to
-- call people up.
CREATE OR REPLACE FUNCTION contest_board(p_contest uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_c       contests%ROWTYPE;
  v_manage  boolean;
  v_operate boolean;
  v_here    boolean;
  v_view    boolean;
  v_board   jsonb := '[]'::jsonb;
  v_line    jsonb := '[]'::jsonb;
  v_me      jsonb;
  v_now_up  jsonb;
  v_ops     jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  SELECT * INTO v_c FROM contests WHERE id = p_contest;
  IF v_c.id IS NULL THEN RETURN NULL; END IF;

  v_manage  := contest_can_manage(p_contest);
  v_operate := v_manage OR contest_can_operate(p_contest);
  IF NOT v_operate AND (NOT v_c.venue_approved OR v_c.status IN ('draft','hidden')) THEN
    RETURN NULL;
  END IF;

  v_here := EXISTS (
    SELECT 1 FROM sessions
    WHERE user_id = v_uid AND zone_id = v_c.zone_id AND is_active = true AND checked_out_at IS NULL
  );
  v_view := v_here OR v_operate;

  IF v_view THEN
    SELECT COALESCE(jsonb_agg(r.item ORDER BY (r.item->>'rank')::int, r.item->>'best_at'), '[]'::jsonb)
    INTO v_board FROM (
      SELECT jsonb_build_object(
        'entry_id', e.id,
        'name', CASE WHEN NOT v_operate AND is_blocked_between(v_uid, e.user_id) THEN NULL ELSE e.display_name END,
        'best_score', e.best_score,
        'best_at', e.best_at,
        'attempts_used', e.attempts_used,
        'status', e.status,
        'is_me', e.user_id = v_uid,
        'rank', rank() OVER (ORDER BY CASE WHEN v_c.higher_wins THEN -e.best_score ELSE e.best_score END)
      ) AS item
      FROM contest_entries e
      WHERE e.contest_id = p_contest AND e.best_score IS NOT NULL
        AND e.status NOT IN ('withdrawn','removed')
      ORDER BY CASE WHEN v_c.higher_wins THEN -e.best_score ELSE e.best_score END, e.best_at
      LIMIT 300
    ) r;

    SELECT COALESCE(jsonb_agg(q.item ORDER BY (q.item->>'position')::int), '[]'::jsonb)
    INTO v_line FROM (
      SELECT jsonb_build_object(
        'entry_id', e.id,
        'name', CASE WHEN NOT v_operate AND is_blocked_between(v_uid, e.user_id) THEN NULL ELSE e.display_name END,
        'status', e.status,
        'attempts_used', e.attempts_used,
        'is_me', e.user_id = v_uid,
        'position', CASE WHEN e.status = 'up' THEN 0
                         ELSE row_number() OVER (PARTITION BY e.status = 'up' ORDER BY e.queue_no) END
      ) AS item
      FROM contest_entries e
      WHERE e.contest_id = p_contest AND e.status IN ('up','waiting')
      ORDER BY e.status = 'up' DESC, e.queue_no
      LIMIT 300
    ) q;
  END IF;

  -- Who is up, by name: the hero card on every screen, and safe to show anyone
  -- who can see the contest at all (it is on the screen in the room anyway).
  SELECT jsonb_build_object(
    'entry_id', e.id,
    'name', CASE WHEN NOT v_operate AND is_blocked_between(v_uid, e.user_id) THEN NULL ELSE e.display_name END,
    'attempts_used', e.attempts_used,
    'is_me', e.user_id = v_uid
  ) INTO v_now_up
  FROM contest_entries e WHERE e.id = v_c.now_up_entry_id AND e.status = 'up';

  SELECT jsonb_build_object(
    'entry_id', e.id,
    'status', e.status,
    'attempts_used', e.attempts_used,
    'best_score', e.best_score,
    'position', CASE WHEN e.status = 'waiting' THEN (
      SELECT count(*) + 1 FROM contest_entries w
      WHERE w.contest_id = p_contest AND w.status = 'waiting' AND w.queue_no < e.queue_no
    ) ELSE NULL END,
    'rank', CASE WHEN e.best_score IS NULL THEN NULL ELSE (
      SELECT count(*) + 1 FROM contest_entries o
      WHERE o.contest_id = p_contest AND o.best_score IS NOT NULL
        AND o.status NOT IN ('withdrawn','removed')
        AND CASE WHEN v_c.higher_wins THEN o.best_score > e.best_score ELSE o.best_score < e.best_score END
    ) END
  ) INTO v_me
  FROM contest_entries e WHERE e.contest_id = p_contest AND e.user_id = v_uid;

  IF v_operate THEN
    SELECT jsonb_build_object(
      'skipped', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('entry_id', e.id, 'name', e.display_name,
                                            'status', e.status, 'attempts_used', e.attempts_used)
                         ORDER BY e.updated_at DESC)
        FROM contest_entries e
        WHERE e.contest_id = p_contest AND e.status IN ('no_show','removed')
      ), '[]'::jsonb),
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'entry_id', a.entry_id, 'score', a.score,
                                            'voided', a.voided, 'created_at', a.created_at)
                         ORDER BY a.created_at DESC)
        FROM (SELECT * FROM contest_attempts WHERE contest_id = p_contest
              ORDER BY created_at DESC LIMIT 500) a
      ), '[]'::jsonb),
      'operators', CASE WHEN v_manage THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('user_id', p.id, 'display_name', p.display_name,
                                            'username', p.username) ORDER BY o.created_at)
        FROM contest_operators o JOIN profiles p ON p.id = o.user_id
        WHERE o.contest_id = p_contest
      ), '[]'::jsonb) ELSE NULL END
    ) INTO v_ops;
  END IF;

  RETURN jsonb_build_object(
    'contest', to_jsonb(v_c) || jsonb_build_object(
      'zone_name', (SELECT name FROM zones WHERE id = v_c.zone_id),
      'org_name',  (SELECT name FROM organizations WHERE id = v_c.org_id),
      'zone_owner_is_me', EXISTS (SELECT 1 FROM zones WHERE id = v_c.zone_id AND owner_id = v_uid)
    ),
    'role', CASE WHEN v_manage THEN 'manager' WHEN v_operate THEN 'operator' ELSE NULL END,
    'checked_in', v_here,
    'can_view', v_view,
    'me', v_me,
    'now_up', v_now_up,
    'leaderboard', v_board,
    'line', v_line,
    'ops', v_ops,
    'server_now', now()
  );
END $$;

-- ── 9. Who can call what ─────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'contest_save(uuid, uuid, uuid, jsonb)',
    'contest_approve(uuid, boolean)',
    'contest_add_operator(uuid, text)',
    'contest_remove_operator(uuid, uuid)',
    'contest_delete(uuid)',
    'contest_set_status(uuid, text)',
    'contest_set_signups(uuid, boolean)',
    'contest_set_ticker(uuid, text)',
    'contest_call(uuid, uuid)',
    'contest_record_score(uuid, uuid, numeric)',
    'contest_edit_attempt(uuid, numeric)',
    'contest_void_attempt(uuid)',
    'contest_set_entry_status(uuid, text)',
    'contest_join(uuid)',
    'contest_withdraw(uuid)',
    'contest_board(uuid)',
    'contest_can_manage(uuid)',
    'contest_can_operate(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ── 10. Realtime: one row per contest is all a screen listens to ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contests;
  END IF;
END $$;
