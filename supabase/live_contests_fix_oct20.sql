-- Live contests: fixes from the Oct 20 test run. Run once in the Supabase SQL
-- editor, after live_contests.sql. Safe to re-run. These are the same function
-- bodies live_contests.sql now has, so a fresh install needs only that file.
--
-- 1. An operator who is also in a contest can't score, fix or void their own
--    turn (new error: cannot_score_self). Another operator has to.
-- 2. An operator skipping or removing their own entry is leaving the line, the
--    same as tapping Leave: a score stays on the board and they can sign up
--    again. "The host removed you" now only ever means someone else did it.

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
