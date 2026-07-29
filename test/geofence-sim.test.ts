import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presenceFromFix, applyPresenceReading } from '../lib/presence.ts'
import {
  type LatLng, type ZoneModel, withinZone, offsetMeters, rectVenue, simulateFix, rng,
} from './geo-model.ts'

// A real Nashville-ish anchor. Exact coords don't matter; geometry is relative.
const ANCHOR: LatLng = { lat: 36.1627, lng: -86.7816 }

// Standard test venue: a 30m x 20m building footprint. Presence margin 30m,
// check-in margin 15m (the shipped defaults).
const VENUE: ZoneModel = { center: ANCHOR, radiusMeters: 15, polygon: rectVenue(ANCHOR, 30, 20) }
const PRESENCE_MARGIN = 30
const CHECKIN_MARGIN = 15

interface TickSpec { pos: LatLng; accuracy: number | null; rpcError?: boolean }

// Step a GPS trace through the exact decision path the app uses:
// getBestCoords-style fix -> (skip RPC if untrusted) -> withinZone (or null on
// RPC error) -> presenceFromFix -> applyPresenceReading. Returns whether/when an
// eviction fired.
function runTrace(zone: ZoneModel, ticks: TickSpec[], presenceMargin: number, seed = 1) {
  const rand = rng(seed)
  let strikes = 0
  let evictTick: number | null = null
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]
    const fix = simulateFix(t.pos, t.accuracy, rand)
    const trustworthy = fix.accuracy != null && fix.accuracy <= 60
    const inZone = t.rpcError ? null : (trustworthy ? withinZone(fix, zone, presenceMargin) : null)
    const reading = presenceFromFix(fix, inZone, 60)
    const r = applyPresenceReading(strikes, reading)
    strikes = r.strikes
    if (r.evict && evictTick === null) evictTick = i + 1
  }
  return { evicted: evictTick !== null, evictTick }
}

const stay = (pos: LatLng, accuracy: number | null, n: number, rpcError = false): TickSpec[] =>
  Array.from({ length: n }, () => ({ pos, accuracy, rpcError }))

// ── No false evictions ──────────────────────────────────────────────────────

test('stationary well inside, noisy fixes: never evicted', () => {
  assert.equal(runTrace(VENUE, stay(ANCHOR, 15, 30), PRESENCE_MARGIN).evicted, false)
})

test('stationary right at the wall, jitter crossing the boundary: never evicted', () => {
  const wall = offsetMeters(ANCHOR, 15, 0) // on the east wall (half-width 15m)
  assert.equal(runTrace(VENUE, stay(wall, 15, 30), PRESENCE_MARGIN).evicted, false)
})

test('pacing back and forth across the boundary (flapping): never evicted', () => {
  const flap: TickSpec[] = []
  for (let i = 0; i < 24; i++) flap.push({ pos: offsetMeters(ANCHOR, 15 + (i % 2 ? 3 : -3), 0), accuracy: 8 })
  assert.equal(runTrace(VENUE, flap, PRESENCE_MARGIN).evicted, false)
})

test('a single outside spike then back inside: never evicted', () => {
  const out = offsetMeters(ANCHOR, 65, 0) // ~50m beyond the wall
  const ticks = [...stay(ANCHOR, 12, 1), ...stay(out, 10, 1), ...stay(ANCHOR, 12, 3)]
  assert.equal(runTrace(VENUE, ticks, PRESENCE_MARGIN).evicted, false)
})

test('degraded accuracy while genuinely outside: never evicted (unknown, not outside)', () => {
  const out = offsetMeters(ANCHOR, 65, 0)
  assert.equal(runTrace(VENUE, stay(out, 80, 12), PRESENCE_MARGIN).evicted, false)
})

test('RPC errors while genuinely outside: never evicted (the false-eviction fix)', () => {
  const out = offsetMeters(ANCHOR, 65, 0)
  assert.equal(runTrace(VENUE, stay(out, 10, 12, /* rpcError */ true), PRESENCE_MARGIN).evicted, false)
})

// ── Real departures still evict, promptly but not prematurely ───────────────

test('walking clearly out with good accuracy: evicts on the 2nd confirmed-outside read', () => {
  const out = offsetMeters(ANCHOR, 65, 0) // 50m beyond, well past the 30m margin
  const r = runTrace(VENUE, stay(out, 10, 6), PRESENCE_MARGIN)
  assert.equal(r.evicted, true)
  assert.equal(r.evictTick, 2)
})

test('one confirmed-outside read alone does not evict', () => {
  const out = offsetMeters(ANCHOR, 65, 0)
  assert.equal(runTrace(VENUE, stay(out, 10, 1), PRESENCE_MARGIN).evicted, false)
})

// ── Adjacent venues do not bleed ────────────────────────────────────────────

test('standing inside a neighbor venue evicts you from your active venue, and lets you into the neighbor', () => {
  const centerB = offsetMeters(ANCHOR, 0, 60) // 60m north
  const venueB: ZoneModel = { center: centerB, radiusMeters: 15, polygon: rectVenue(centerB, 30, 20) }

  // Active zone is VENUE; user is standing in venueB. They should leave VENUE...
  assert.equal(runTrace(VENUE, stay(centerB, 10, 4), PRESENCE_MARGIN).evicted, true)
  // ...and never count as inside VENUE even at the generous presence margin...
  assert.equal(withinZone(centerB, VENUE, PRESENCE_MARGIN), false)
  // ...while being cleanly inside venueB for check-in.
  assert.equal(withinZone(centerB, venueB, CHECKIN_MARGIN), true)
})

// ── Concave / irregular polygons ────────────────────────────────────────────

test('concave (L-shaped) footprint: a point in the notch is NOT inside', () => {
  const L: LatLng[] = [
    offsetMeters(ANCHOR, -20, -20),
    offsetMeters(ANCHOR, 20, -20),
    offsetMeters(ANCHOR, 20, 0),
    offsetMeters(ANCHOR, 0, 0),
    offsetMeters(ANCHOR, 0, 20),
    offsetMeters(ANCHOR, -20, 20),
  ]
  const lZone: ZoneModel = { center: ANCHOR, radiusMeters: 15, polygon: L }
  const notch = offsetMeters(ANCHOR, 12, 12)  // top-right cutout, outside the L
  const arm = offsetMeters(ANCHOR, 10, -10)   // bottom-right, inside the L
  assert.equal(withinZone(notch, lZone, 0), false, 'notch is outside the concave polygon')
  assert.equal(withinZone(arm, lZone, 0), true, 'the L arm is inside')
})

// ── Check-in edge tolerance vs. false check-ins ─────────────────────────────

test('check-in margin lets in someone just outside the wall but not someone clearly out', () => {
  assert.equal(withinZone(offsetMeters(ANCHOR, 15 + 12, 0), VENUE, CHECKIN_MARGIN), true)  // 12m out
  assert.equal(withinZone(offsetMeters(ANCHOR, 15 + 40, 0), VENUE, CHECKIN_MARGIN), false) // 40m out
})

test('check-in is stricter than presence (hysteresis band): 20m out fails check-in but keeps presence', () => {
  const p = offsetMeters(ANCHOR, 15 + 20, 0) // 20m beyond the wall
  assert.equal(withinZone(p, VENUE, CHECKIN_MARGIN), false)   // cannot check in from here
  assert.equal(withinZone(p, VENUE, PRESENCE_MARGIN), true)   // but not evicted if already in
})

// ── Radius-circle fallback (venues without a polygon) ───────────────────────

test('radius fallback respects radius + margin', () => {
  const circle: ZoneModel = { center: ANCHOR, radiusMeters: 40 } // no polygon
  assert.equal(withinZone(offsetMeters(ANCHOR, 30, 0), circle, 0), true)   // 30 < 40
  assert.equal(withinZone(offsetMeters(ANCHOR, 55, 0), circle, 0), false)  // 55 > 40
  assert.equal(withinZone(offsetMeters(ANCHOR, 55, 0), circle, 30), true)  // 55 < 40 + 30
})
