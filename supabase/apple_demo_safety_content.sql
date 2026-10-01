-- Content for the App Review account so a reviewer can FIND and USE every
-- Guideline 1.2 control without having to create anything first. Run once, after
-- supabase/apple_demo_account.sql and
-- supabase/apple_1_2_block_enforcement_and_ugc_controls.sql. Safe to run twice.
--
-- Why this exists: the Board needs "checked in AND subscribed", and chat messages
-- expire after 24 hours, so an untouched demo account shows an empty Chat, an
-- empty Board and no conversations. A reviewer looking for "report" and "block"
-- on a screen with nothing on it concludes they do not exist. This seeds, at
-- The Lantern Room, from the demo companions (is_demo profiles other than the
-- review account):
--   * 3 venue Chat messages, set to outlast the review window (anonymous
--     "Guest N" senders, so Report / Block / Delete are all visible)
--   * 2 Board pins, one anonymous, plus the review account's subscription so the
--     Board is reachable after Check In
--   * a Board response thread with a message to report or block
--   * a confirmed We Met with a DM thread to report or block
-- Everything is benign. Each block is independent: a failure in one prints a
-- NOTICE and the rest still run.

DO $$
DECLARE
  v_zone uuid;
  v_demo uuid;
  v_c1   uuid;
  v_c2   uuid;
  v_pin  uuid;
  v_wm   uuid;
BEGIN
  SELECT id INTO v_zone FROM zones WHERE name = 'The Lantern Room' LIMIT 1;
  SELECT id INTO v_demo FROM auth.users WHERE email = 'herenowdemo@gmail.com';

  IF v_zone IS NULL OR v_demo IS NULL THEN
    RAISE NOTICE 'Skipping: need the zone "The Lantern Room" and the review account herenowdemo@gmail.com first.';
    RETURN;
  END IF;

  SELECT id INTO v_c1 FROM profiles WHERE is_demo = true AND id <> v_demo ORDER BY created_at, id LIMIT 1 OFFSET 0;
  SELECT id INTO v_c2 FROM profiles WHERE is_demo = true AND id <> v_demo ORDER BY created_at, id LIMIT 1 OFFSET 1;

  IF v_c1 IS NULL THEN
    RAISE NOTICE 'Skipping: no demo companions found (see section 3 of apple_demo_account.sql).';
    RETURN;
  END IF;
  v_c2 := COALESCE(v_c2, v_c1);

  -- ── Subscription: the Board requires checked in AND subscribed ──────────────
  BEGIN
    INSERT INTO venue_subscriptions (user_id, zone_id, is_subscriber)
    VALUES (v_demo, v_zone, true)
    ON CONFLICT (user_id, zone_id) DO UPDATE SET is_subscriber = true;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'subscription: %', SQLERRM; END;

  -- ── Chat: anonymous senders, expiry pushed out past the review window ───────
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM venue_chat WHERE zone_id = v_zone AND content = 'Anyone tried the cold brew here yet?') THEN
      INSERT INTO venue_chat (zone_id, user_id, content, expires_at) VALUES
        (v_zone, v_c1, 'Anyone tried the cold brew here yet?',        now() + INTERVAL '180 days'),
        (v_zone, v_c2, 'Yes! The oat milk one is great.',             now() + INTERVAL '180 days'),
        (v_zone, v_c1, 'Nice, grabbing one before the set starts.',   now() + INTERVAL '180 days');
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat: %', SQLERRM; END;

  -- ── Board pins: one anonymous, one respondable ──────────────────────────────
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM board_pins WHERE zone_id = v_zone AND title = 'Open mic sign-up tonight') THEN
      INSERT INTO board_pins (zone_id, user_id, category, title, body, is_anonymous, status)
      VALUES (v_zone, v_c1, 'flyers', 'Open mic sign-up tonight',
              'Sign-up sheet is at the bar. Five minutes each, all styles welcome.', false, 'active');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM board_pins WHERE zone_id = v_zone AND title = 'Small thought from the corner table') THEN
      INSERT INTO board_pins (zone_id, user_id, category, title, body, is_anonymous, status)
      VALUES (v_zone, v_c2, 'thoughts', 'Small thought from the corner table',
              'Funny how a room full of strangers can feel like a living room by the second song.', true, 'active');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM board_pins WHERE zone_id = v_zone AND title = 'Used acoustic guitar') THEN
      INSERT INTO board_pins (zone_id, user_id, category, title, body, is_anonymous, status)
      VALUES (v_zone, v_c2, 'for_sale', 'Used acoustic guitar',
              'Lightly used, comes with a case. Ask me about it here.', false, 'active');
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'board pins: %', SQLERRM; END;

  -- ── Board response thread the reviewer can report or block from ─────────────
  BEGIN
    SELECT id INTO v_pin FROM board_pins WHERE zone_id = v_zone AND title = 'Used acoustic guitar' LIMIT 1;
    IF v_pin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM board_responses WHERE pin_id = v_pin AND responder_id = v_demo) THEN
      -- owner_id / zone_id are filled in by the trg_board_response_fill trigger.
      INSERT INTO board_responses (pin_id, zone_id, responder_id, owner_id)
      VALUES (v_pin, v_zone, v_demo, v_c2);

      INSERT INTO board_response_messages (response_id, sender_id, content)
      SELECT r.id, v_c2, 'Hi! Still available. Happy to show it to you tonight.'
      FROM board_responses r WHERE r.pin_id = v_pin AND r.responder_id = v_demo;
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'board response: %', SQLERRM; END;

  -- ── A confirmed We Met with a DM, so the DM screen has something to report ──
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM we_met WHERE initiator_id = v_c1 AND recipient_id = v_demo) THEN
      INSERT INTO we_met (zone_id, initiator_id, recipient_id, status, confirmed_at, expires_at)
      VALUES (v_zone, v_c1, v_demo, 'confirmed', now(), '2099-12-31T00:00:00Z')
      RETURNING id INTO v_wm;

      INSERT INTO direct_messages (we_met_id, sender_id, recipient_id, content, expires_at)
      VALUES (v_wm, v_c1, v_demo, 'Hey, good to meet you tonight!', '2099-12-31T00:00:00Z');
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'we met / dm: %', SQLERRM; END;
END $$;

-- Verify (each should be > 0):
--   SELECT count(*) FROM venue_chat WHERE content LIKE 'Anyone tried the cold brew%';
--   SELECT count(*) FROM board_pins WHERE title IN ('Open mic sign-up tonight','Small thought from the corner table','Used acoustic guitar');
--   SELECT count(*) FROM board_responses r JOIN auth.users u ON u.id = r.responder_id WHERE u.email = 'herenowdemo@gmail.com';
--   SELECT count(*) FROM we_met w JOIN auth.users u ON u.id = w.recipient_id WHERE u.email = 'herenowdemo@gmail.com';
