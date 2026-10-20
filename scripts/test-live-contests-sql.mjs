// End-to-end test of supabase/live_contests.sql on a real Postgres (PGlite,
// Postgres compiled to WebAssembly), with minimal stand-ins for the Supabase
// pieces it touches: auth.uid(), the authenticated role, profiles, zones,
// organizations, sessions, user_blocks and is_blocked_between().
//
// Not part of `npm test`, so the app doesn't carry the dependency. To run:
//
//   npm install --no-save @electric-sql/pglite
//   node --test --test-concurrency=1 scripts/test-live-contests-sql.mjs
//
// Run it after any change to live_contests.sql, before pasting it into Supabase.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const SQL = readFileSync(fileURLToPath(new URL('../supabase/live_contests.sql', import.meta.url)), 'utf8')
const db = new PGlite()

const ids = {}
const uid = (n) => ids[n]

const STUBS = `
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE PUBLICATION supabase_realtime;

CREATE TABLE profiles (id uuid PRIMARY KEY, display_name text, username text,
  is_admin boolean DEFAULT false, is_banned boolean DEFAULT false);
CREATE TABLE zones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, owner_id uuid);
CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid, name text,
  host_zone_id uuid, status text DEFAULT 'active');
CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), zone_id uuid, user_id uuid,
  is_active boolean DEFAULT true, checked_out_at timestamptz, is_ghost boolean DEFAULT false);
CREATE TABLE user_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blocker_id uuid, blocked_id uuid);

CREATE OR REPLACE FUNCTION public.is_blocked_between(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    a IS NOT NULL AND b IS NOT NULL AND a <> b
    AND (auth.uid() IS NULL OR auth.uid() = a OR auth.uid() = b)
    AND EXISTS (SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = a AND ub.blocked_id = b) OR (ub.blocker_id = b AND ub.blocked_id = a)),
    false);
$$;
`

async function asUser(name, sql, params = []) {
  await db.exec(`SET ROLE authenticated`)
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [name ? uid(name) : ''])
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec(`RESET ROLE`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  }
}
const rpc = async (name, fn, args) => {
  const keys = Object.keys(args)
  const sql = `SELECT ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) AS r`
  const res = await asUser(name, sql, keys.map((k) => args[k]))
  return res.rows[0].r
}
const rejects = async (p, code) => {
  await assert.rejects(p, (e) => { assert.match(e.message, new RegExp(code)); return true })
}
const board = (name, c) => rpc(name, 'contest_board', { p_contest: c })
const checkIn = (name, zone) =>
  db.query(`INSERT INTO sessions (zone_id, user_id) VALUES ($1, $2)`, [zone, uid(name)])

test('setup: stubs load and the migration runs twice cleanly', async () => {
  await db.exec(STUBS)
  for (const n of ['venue', 'venue2', 'orgowner', 'staff', 'u1', 'u2', 'u3', 'u4', 'outsider', 'admin', 'banned']) {
    ids[n] = crypto.randomUUID()
  }
  const names = { venue: 'Skinny Dennis', venue2: 'Other Bar', orgowner: 'Monster Rep',
    staff: 'Bar Staff', u1: 'Jordan Parker', u2: 'Sam Taylor', u3: 'Riley', u4: 'Casey Jones',
    outsider: 'Out Sider', admin: 'Admin Person', banned: 'Bad Actor' }
  for (const [k, v] of Object.entries(names)) {
    await db.query(`INSERT INTO profiles (id, display_name, username, is_admin, is_banned) VALUES ($1,$2,$3,$4,$5)`,
      [uid(k), v, k, k === 'admin', k === 'banned'])
  }
  ids.zone = (await db.query(`INSERT INTO zones (name, owner_id) VALUES ('Skinny Dennis', $1) RETURNING id`, [uid('venue')])).rows[0].id
  ids.zone2 = (await db.query(`INSERT INTO zones (name, owner_id) VALUES ('Other Bar', $1) RETURNING id`, [uid('venue2')])).rows[0].id
  ids.org = (await db.query(`INSERT INTO organizations (owner_id, name, host_zone_id) VALUES ($1, 'Monster Energy', $2) RETURNING id`, [uid('orgowner'), ids.zone])).rows[0].id
  ids.org2 = (await db.query(`INSERT INTO organizations (owner_id, name, host_zone_id) VALUES ($1, 'Elsewhere Co', $2) RETURNING id`, [uid('orgowner'), ids.zone2])).rows[0].id

  await db.exec(SQL)
  await db.exec(SQL) // idempotent
  // Supabase grants table privileges broadly; RLS is what restricts.
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon`)
  const pub = await db.query(`SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'`)
  assert.deepEqual(pub.rows.map((r) => r.tablename), ['contests'])
})

test('creating: venue owner is approved at once, an org waits, strangers cannot', async () => {
  ids.c = await rpc('venue', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: null,
    p: { title: 'Bull Riding Night', score_label: 'Ride time', score_suffix: 's', score_decimals: 2,
         presented_by: 'Monster Energy', accent_color: '#7AC143', max_entries: 3 } })
  const c = (await db.query(`SELECT * FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.venue_approved, true)
  assert.equal(c.status, 'draft')
  assert.equal(c.score_suffix, 's')
  assert.equal(c.score_decimals, 2)

  ids.orgc = await rpc('orgowner', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: ids.org,
    p: { title: 'Monster Pull-up Challenge', status: 'scheduled' } })
  const oc = (await db.query(`SELECT * FROM contests WHERE id=$1`, [ids.orgc])).rows[0]
  assert.equal(oc.venue_approved, false)
  assert.equal(oc.status, 'scheduled')

  await rejects(rpc('u1', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: null, p: { title: 'x' } }), 'not_allowed')
  // An org can't run a contest at a venue it doesn't call home.
  await rejects(rpc('orgowner', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: ids.org2, p: { title: 'x' } }), 'not_allowed')
  await rejects(rpc('banned', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: null, p: { title: 'x' } }), 'not_allowed')
  await rejects(rpc('venue', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: null, p: { title: ' ' } }), 'title_required')
  // A bad color is refused by the table itself.
  await rejects(rpc('venue', 'contest_save', { p_contest: ids.c, p_zone: null, p_org: null, p: { accent_color: 'green' } }), 'contests_accent_hex')
})

test('visibility: drafts and unapproved contests are invisible to the public', async () => {
  const seen = async (who) => (await asUser(who, `SELECT id FROM contests`)).rows.map((r) => r.id)
  assert.deepEqual(await seen('u1'), []) // one draft, one unapproved
  assert.equal(await board('u1', ids.orgc), null)
  // The venue owner sees both, including the one waiting on them.
  assert.equal((await seen('venue')).length, 2)
  await rpc('venue', 'contest_approve', { p_contest: ids.orgc, p_approved: true })
  assert.deepEqual(await seen('u1'), [ids.orgc])
  // Only the venue owner (or an admin) approves; the org can't approve itself.
  await rejects(rpc('orgowner', 'contest_approve', { p_contest: ids.orgc, p_approved: true }), 'not_allowed')
  // No direct writes at all.
  await rejects(asUser('venue', `INSERT INTO contests (zone_id, title) VALUES ($1, 'sneaky')`, [ids.zone]), 'row-level security')
  await rejects(asUser('venue', `UPDATE contests SET venue_approved = true WHERE id = $1 RETURNING id`, [ids.c]).then((r) => { if (r.rows.length === 0) throw new Error('row-level security: no rows') }), 'row-level security')
  await rejects(asUser('u1', `SELECT contest_touch($1)`, [ids.c]), 'permission denied')
})

test('operators: added by username, can run but not edit settings', async () => {
  const added = await rpc('venue', 'contest_add_operator', { p_contest: ids.c, p_username: '@Staff' })
  assert.equal(added.user_id, uid('staff'))
  await rejects(rpc('venue', 'contest_add_operator', { p_contest: ids.c, p_username: 'nobody' }), 'user_not_found')
  await rejects(rpc('u1', 'contest_add_operator', { p_contest: ids.c, p_username: 'u2' }), 'not_allowed')
  await rejects(rpc('staff', 'contest_save', { p_contest: ids.c, p_zone: null, p_org: null, p: { title: 'renamed' } }), 'not_allowed')
  await rpc('staff', 'contest_set_status', { p_contest: ids.c, p_status: 'scheduled' })
  const b = await board('staff', ids.c)
  assert.equal(b.role, 'operator')
  assert.equal(b.ops.operators, null) // only managers see the operator list
  const mb = await board('venue', ids.c)
  assert.equal(mb.role, 'manager')
  assert.equal(mb.ops.operators.length, 1)
})

test('joining: checked in, signups open, not full, once', async () => {
  await rejects(rpc('u1', 'contest_join', { p_contest: ids.c }), 'signups_closed')
  await rpc('staff', 'contest_set_signups', { p_contest: ids.c, p_open: true })
  await rejects(rpc('u1', 'contest_join', { p_contest: ids.c }), 'not_checked_in')
  // Checked in somewhere else doesn't count.
  await checkIn('u1', ids.zone2)
  await rejects(rpc('u1', 'contest_join', { p_contest: ids.c }), 'not_checked_in')
  for (const u of ['u1', 'u2', 'u3', 'u4', 'outsider', 'banned']) await checkIn(u, ids.zone)
  await db.query(`UPDATE sessions SET is_active=false, checked_out_at=now() WHERE user_id=$1`, [uid('outsider')])

  const j1 = await rpc('u1', 'contest_join', { p_contest: ids.c })
  assert.equal(j1.already, false)
  assert.equal((await rpc('u1', 'contest_join', { p_contest: ids.c })).already, true)
  await rpc('u2', 'contest_join', { p_contest: ids.c })
  await rpc('u3', 'contest_join', { p_contest: ids.c })
  await rejects(rpc('u4', 'contest_join', { p_contest: ids.c }), 'full')
  await rejects(rpc('banned', 'contest_join', { p_contest: ids.c }), 'not_allowed')

  const c = (await db.query(`SELECT entry_count FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.entry_count, 3)
  const names = (await db.query(`SELECT display_name FROM contest_entries WHERE contest_id=$1 ORDER BY queue_no`, [ids.c])).rows.map((r) => r.display_name)
  assert.deepEqual(names, ['Jordan P.', 'Sam T.', 'Riley'])
})

test('the board: people only for those in the room', async () => {
  const mine = await board('u2', ids.c)
  assert.equal(mine.can_view, true)
  assert.equal(mine.me.position, 2)
  assert.deepEqual(mine.line.map((l) => [l.name, l.position, l.is_me]),
    [['Jordan P.', 1, false], ['Sam T.', 2, true], ['Riley', 3, false]])

  const out = await board('outsider', ids.c)
  assert.equal(out.can_view, false)
  assert.equal(out.checked_in, false)
  assert.deepEqual(out.line, [])
  assert.equal(out.contest.title, 'Bull Riding Night')
  assert.equal(out.contest.zone_name, 'Skinny Dennis')
  assert.equal(out.ops, null)

  // Entrants see only their own row directly.
  const rows = (await asUser('u2', `SELECT user_id FROM contest_entries`)).rows
  assert.deepEqual(rows.map((r) => r.user_id), [uid('u2')])
  assert.equal((await asUser('staff', `SELECT id FROM contest_entries`)).rows.length, 3)
})

test('running it: call, score, rank, ties', async () => {
  const v0 = (await db.query(`SELECT version FROM contests WHERE id=$1`, [ids.c])).rows[0].version
  const call1 = await rpc('staff', 'contest_call', { p_contest: ids.c })
  assert.equal(call1.called.user_id, uid('u1'))
  assert.equal(call1.on_deck.user_id, uid('u2'))
  let c = (await db.query(`SELECT * FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.status, 'live') // calling starts it
  assert.ok(Number(c.version) > Number(v0))
  assert.equal((await board('u2', ids.c)).now_up.name, 'Jordan P.')
  assert.equal((await board('u1', ids.c)).now_up.is_me, true)

  const s1 = await rpc('staff', 'contest_record_score', { p_contest: ids.c, p_entry: call1.called.entry_id, p_score: 7.4249 })
  assert.equal(Number(s1.best_score), 7.42) // rounded to the contest's 2 decimals
  c = (await db.query(`SELECT now_up_entry_id FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.now_up_entry_id, null)
  await rejects(rpc('staff', 'contest_record_score', { p_contest: ids.c, p_entry: call1.called.entry_id, p_score: 9 }), 'no_attempts_left')
  await rejects(rpc('staff', 'contest_record_score', { p_contest: ids.c, p_entry: call1.called.entry_id, p_score: 'NaN' }), 'bad_score')
  await rejects(rpc('u2', 'contest_record_score', { p_contest: ids.c, p_entry: call1.called.entry_id, p_score: 99 }), 'not_allowed')

  const call2 = await rpc('staff', 'contest_call', { p_contest: ids.c })
  assert.equal(call2.called.user_id, uid('u2'))
  assert.equal(call2.on_deck.user_id, uid('u3'))
  await rpc('staff', 'contest_record_score', { p_contest: ids.c, p_entry: call2.called.entry_id, p_score: 8.1 })
  const call3 = await rpc('staff', 'contest_call', { p_contest: ids.c })
  assert.equal(call3.on_deck, null)
  await rpc('staff', 'contest_record_score', { p_contest: ids.c, p_entry: call3.called.entry_id, p_score: 7.42 })
  assert.deepEqual(await rpc('staff', 'contest_call', { p_contest: ids.c }), { called: null })

  const b = await board('u3', ids.c)
  assert.deepEqual(b.leaderboard.map((r) => [r.name, Number(r.best_score), r.rank]),
    [['Sam T.', 8.1, 1], ['Jordan P.', 7.42, 2], ['Riley', 7.42, 2]]) // tie: first to get there listed first
  assert.equal(b.me.rank, 2)
  assert.deepEqual(b.line, [])
  ids.u1entry = call1.called.entry_id
  ids.u2entry = call2.called.entry_id
})

test('fixing mistakes: edit, void, no-show, remove, back in line', async () => {
  const ops = (await board('staff', ids.c)).ops
  const a2 = ops.attempts.find((a) => a.entry_id === ids.u2entry)
  await rpc('staff', 'contest_edit_attempt', { p_attempt: a2.id, p_score: 6.5 })
  let b = await board('u1', ids.c)
  assert.equal(b.leaderboard[0].name, 'Jordan P.')
  assert.equal(b.me.rank, 1)

  // Bull broke: void Jordan's ride, he goes to the back for a re-ride.
  const a1 = ops.attempts.find((a) => a.entry_id === ids.u1entry)
  await rpc('staff', 'contest_void_attempt', { p_attempt: a1.id })
  b = await board('u1', ids.c)
  assert.equal(b.me.status, 'waiting')
  assert.equal(b.me.best_score, null)
  assert.equal(b.me.position, 1)
  assert.equal(b.leaderboard.find((r) => r.is_me), undefined)

  // Called and doesn't show: skip him, then he turns up and goes back in line.
  const call = await rpc('staff', 'contest_call', { p_contest: ids.c, p_entry: ids.u1entry })
  assert.equal(call.called.user_id, uid('u1'))
  await rpc('staff', 'contest_set_entry_status', { p_entry: ids.u1entry, p_status: 'no_show' })
  let c = (await db.query(`SELECT now_up_entry_id FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.now_up_entry_id, null)
  assert.equal((await board('staff', ids.c)).ops.skipped.length, 1)
  await rpc('staff', 'contest_set_entry_status', { p_entry: ids.u1entry, p_status: 'waiting' })
  assert.equal((await board('u1', ids.c)).me.status, 'waiting')

  // Calling someone else while one is up puts the first back in their place.
  await rpc('staff', 'contest_call', { p_contest: ids.c, p_entry: ids.u1entry })
  await rpc('staff', 'contest_call', { p_contest: ids.c, p_entry: ids.u1entry })
  assert.equal((await board('u1', ids.c)).me.status, 'up')

  // Removed: off the board, entry count drops, can't come back.
  await rpc('staff', 'contest_set_entry_status', { p_entry: ids.u2entry, p_status: 'removed' })
  b = await board('u1', ids.c)
  assert.equal(b.leaderboard.some((r) => r.name === 'Sam T.'), false)
  c = (await db.query(`SELECT entry_count FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.entry_count, 2)
  await rejects(rpc('u2', 'contest_join', { p_contest: ids.c }), 'removed')
  // Now there's room for u4.
  await rpc('u4', 'contest_join', { p_contest: ids.c })
})

test('leaving the line and coming back', async () => {
  await rpc('u4', 'contest_withdraw', { p_contest: ids.c })
  let me = (await board('u4', ids.c)).me
  assert.equal(me.status, 'withdrawn')
  let c = (await db.query(`SELECT entry_count FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.entry_count, 2)
  await rpc('u4', 'contest_join', { p_contest: ids.c })
  me = (await board('u4', ids.c)).me
  assert.equal(me.status, 'waiting')
  // Jordan is up, so u4 is first in the waiting line.
  assert.equal(me.position, 1)
  // Withdrawing while up frees the spot.
  await rpc('u1', 'contest_withdraw', { p_contest: ids.c })
  c = (await db.query(`SELECT now_up_entry_id FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.now_up_entry_id, null)
})

test('blocks hide names from entrants, not from operators', async () => {
  await db.query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [uid('u4'), uid('u3')])
  const b = await board('u4', ids.c)
  const riley = b.leaderboard.find((r) => Number(r.best_score) === 7.42)
  assert.equal(riley.name, null)
  const sb = await board('staff', ids.c)
  assert.equal(sb.leaderboard.find((r) => Number(r.best_score) === 7.42).name, 'Riley')
})

test('more rounds, lower wins, and the scoring lock', async () => {
  ids.c2 = await rpc('venue', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: null,
    p: { title: 'Fastest Pint', higher_wins: false, attempts_per_entry: 2, score_decimals: 1, status: 'scheduled' } })
  await rpc('venue', 'contest_set_signups', { p_contest: ids.c2, p_open: true })
  for (const u of ['u3', 'u4']) await rpc(u, 'contest_join', { p_contest: ids.c2 })
  let call = await rpc('venue', 'contest_call', { p_contest: ids.c2 })
  const r3 = call.called.entry_id
  await rpc('venue', 'contest_record_score', { p_contest: ids.c2, p_entry: r3, p_score: 6.0 })
  // One attempt left: to the back of the line, not done.
  let me = (await board('u3', ids.c2)).me
  assert.equal(me.status, 'waiting')
  assert.equal(me.position, 2)
  call = await rpc('venue', 'contest_call', { p_contest: ids.c2 })
  await rpc('venue', 'contest_record_score', { p_contest: ids.c2, p_entry: call.called.entry_id, p_score: 5.5 })
  call = await rpc('venue', 'contest_call', { p_contest: ids.c2 })
  assert.equal(call.called.entry_id, r3)
  await rpc('venue', 'contest_record_score', { p_contest: ids.c2, p_entry: r3, p_score: 4.96 })
  me = (await board('u3', ids.c2)).me
  assert.equal(me.status, 'done')
  assert.equal(Number(me.best_score), 5.0) // lower wins, rounded to 1 decimal
  assert.equal(me.rank, 1)
  await rejects(rpc('venue', 'contest_save', { p_contest: ids.c2, p_zone: null, p_org: null, p: { higher_wins: true } }), 'scoring_locked')
  // Other edits still fine after scoring starts.
  await rpc('venue', 'contest_save', { p_contest: ids.c2, p_zone: null, p_org: null, p: { tagline: 'Chug responsibly', higher_wins: false } })
})

test('ticker, ending, the kill switch, deleting', async () => {
  await rpc('staff', 'contest_set_ticker', { p_contest: ids.c, p_text: '  Back in 10, bull tune-up  ' })
  let c = (await db.query(`SELECT * FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.ticker, 'Back in 10, bull tune-up')
  await rpc('staff', 'contest_set_ticker', { p_contest: ids.c, p_text: 'x'.repeat(300) })
  c = (await db.query(`SELECT ticker FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.ticker.length, 140)
  await rpc('staff', 'contest_set_ticker', { p_contest: ids.c, p_text: '' })

  await rpc('staff', 'contest_call', { p_contest: ids.c })
  await rpc('staff', 'contest_set_status', { p_contest: ids.c, p_status: 'ended' })
  c = (await db.query(`SELECT * FROM contests WHERE id=$1`, [ids.c])).rows[0]
  assert.equal(c.status, 'ended')
  assert.equal(c.signups_open, false)
  assert.equal(c.now_up_entry_id, null)
  assert.ok(c.ended_at)
  assert.equal((await db.query(`SELECT count(*)::int n FROM contest_entries WHERE contest_id=$1 AND status='up'`, [ids.c])).rows[0].n, 0)
  await rejects(rpc('u3', 'contest_join', { p_contest: ids.c }), 'not_open')
  // Results stay up after it ends.
  assert.ok((await board('u3', ids.c)).leaderboard.length > 0)

  await rpc('staff', 'contest_set_status', { p_contest: ids.c, p_status: 'hidden' })
  assert.equal(await board('u3', ids.c), null)
  assert.ok(await board('staff', ids.c))

  await rejects(rpc('staff', 'contest_delete', { p_contest: ids.c }), 'not_allowed')
  await rpc('orgowner', 'contest_delete', { p_contest: ids.orgc })
  await rpc('venue', 'contest_delete', { p_contest: ids.c })
  assert.equal((await db.query(`SELECT count(*)::int n FROM contest_entries WHERE contest_id=$1`, [ids.c])).rows[0].n, 0)
})

test('admin can create at any venue and approve', async () => {
  const c = await rpc('admin', 'contest_save', { p_contest: null, p_zone: ids.zone2, p_org: null, p: { title: 'Admin test' } })
  assert.equal((await db.query(`SELECT venue_approved FROM contests WHERE id=$1`, [c])).rows[0].venue_approved, true)
  assert.equal((await board('admin', c)).role, 'manager')
})

test('operators in their own contest: no self-scoring, and removing yourself is leaving', async () => {
  const c3 = await rpc('venue', 'contest_save', { p_contest: null, p_zone: ids.zone, p_org: null,
    p: { title: 'Staff Night', score_decimals: 0, status: 'scheduled' } })
  await rpc('venue', 'contest_set_signups', { p_contest: c3, p_open: true })
  for (const u of ['staff', 'u1']) await rpc('venue', 'contest_add_operator', { p_contest: c3, p_username: u })
  await checkIn('staff', ids.zone)
  await db.query(`UPDATE sessions SET is_active = true, checked_out_at = NULL WHERE user_id = $1`, [uid('u1')])
  for (const u of ['staff', 'u1', 'u2']) await rpc(u, 'contest_join', { p_contest: c3 })

  const called = await rpc('venue', 'contest_call', { p_contest: c3 })
  assert.equal(called.called.user_id, uid('staff'))
  const staffEntry = called.called.entry_id
  // Staff can't score their own turn; the venue owner can.
  await rejects(rpc('staff', 'contest_record_score', { p_contest: c3, p_entry: staffEntry, p_score: 12 }), 'cannot_score_self')
  await rpc('venue', 'contest_record_score', { p_contest: c3, p_entry: staffEntry, p_score: 12 })
  const attempt = (await board('venue', c3)).ops.attempts.find((a) => a.entry_id === staffEntry)
  await rejects(rpc('staff', 'contest_edit_attempt', { p_attempt: attempt.id, p_score: 99 }), 'cannot_score_self')
  await rejects(rpc('staff', 'contest_void_attempt', { p_attempt: attempt.id }), 'cannot_score_self')
  // Staff can still score someone else.
  const call2 = await rpc('staff', 'contest_call', { p_contest: c3 })
  assert.equal(call2.called.user_id, uid('u1'))

  // u1, an operator, "removes" their own entry from the console: that's leaving,
  // not being removed, so they can sign up again.
  await rpc('u1', 'contest_set_entry_status', { p_entry: call2.called.entry_id, p_status: 'removed' })
  assert.equal((await board('u1', c3)).me.status, 'withdrawn')
  await rpc('u1', 'contest_join', { p_contest: c3 })
  assert.equal((await board('u1', c3)).me.status, 'waiting')
  // Staff removing themselves after scoring keeps the score on the board.
  await rpc('staff', 'contest_set_entry_status', { p_entry: staffEntry, p_status: 'removed' })
  const sb = await board('staff', c3)
  assert.equal(sb.me.status, 'done')
  assert.equal(Number(sb.me.best_score), 12)

  // Someone else removing you is a removal, and an operator can undo it.
  const u2entry = (await board('u2', c3)).me.entry_id
  await rpc('staff', 'contest_set_entry_status', { p_entry: u2entry, p_status: 'removed' })
  assert.equal((await board('u2', c3)).me.status, 'removed')
  await rejects(rpc('u2', 'contest_join', { p_contest: c3 }), 'removed')
  await rpc('staff', 'contest_set_entry_status', { p_entry: u2entry, p_status: 'waiting' })
  assert.equal((await board('u2', c3)).me.status, 'waiting')
})
