import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type LatLng, type ZoneModel, withinZone, offsetMeters, rectVenue } from './geo-model.ts'
import {
  effectiveCheckinMargin,
  effectivePresenceMargin,
  CHECKIN_ACCURACY_CAP_POLYGON_M,
  CHECKIN_ACCURACY_CAP_CIRCLE_M,
} from '../lib/geofenceTuning.ts'

// This proves the "you could check in from ~50 ft out" fix end to end: it runs
// the SAME geometry the DB uses (withinZone mirrors user_in_zone) with the SAME
// accuracy cushion the app now passes (effectiveCheckinMargin). The behavior it
// pins: at a polygon venue a fuzzy fix can no longer reach across the lot, while
// real patrons inside — and circle venues, and the eviction side — are untouched.

const ANCHOR: LatLng = { lat: 36.1627, lng: -86.7816 }

// 30m x 20m footprint: east/west walls at ±15m, north/south walls at ±10m.
const POLY_VENUE: ZoneModel = { center: ANCHOR, radiusMeters: 10, polygon: rectVenue(ANCHOR, 30, 20) }
const CIRCLE_VENUE: ZoneModel = { center: ANCHOR, radiusMeters: 35 } // no polygon

// Base margins from getZoneMargins() defaults.
const POLY_CHECKIN_BASE = 8
const POLY_PRESENCE_BASE = 25
const CIRCLE_CHECKIN_BASE = 15

// A point `east` metres due east of the venue centre. The east wall is at +15m,
// so eastOf(30) is 15m past the wall, eastOf(45) is 30m past it, etc.
const eastOf = (m: number) => offsetMeters(ANCHOR, m, 0)

// ── Polygon venue: real patrons still get in ─────────────────────────────────

test('polygon: a patron inside always checks in, even with a fuzzy indoor fix', () => {
  // Center is inside the footprint (distance 0), so it passes at ANY accuracy —
  // the July "3 phones inside couldn't check in" regression can't come back.
  for (const acc of [5, 30, 60, null]) {
    assert.equal(withinZone(ANCHOR, POLY_VENUE, effectiveCheckinMargin(POLY_CHECKIN_BASE, true, acc)), true)
  }
})

test('polygon: right by the door (10m past the wall) with a good fix still checks in', () => {
  const nearDoor = eastOf(25) // 10m beyond the east wall
  assert.equal(withinZone(nearDoor, POLY_VENUE, effectiveCheckinMargin(POLY_CHECKIN_BASE, true, 8)), true)
})

// ── Polygon venue: the actual bug is fixed ───────────────────────────────────

test('polygon: a fuzzy fix ~30m past the wall NO LONGER checks in (was the 50ft bug)', () => {
  const acrossLot = eastOf(45) // 30m beyond the east wall — clearly not at the venue
  // Old behavior: the cushion capped at 35, so margin was 8 + 35 = 43 and this
  // point (30m out) fell inside it — you could check in from across the lot.
  const oldMargin = POLY_CHECKIN_BASE + 35
  assert.equal(withinZone(acrossLot, POLY_VENUE, oldMargin), true, 'sanity: the old cushion would have allowed it')
  // New behavior: polygon cushion caps at 12, so margin is 8 + 12 = 20 and 30m
  // out is now rejected.
  assert.equal(withinZone(acrossLot, POLY_VENUE, effectiveCheckinMargin(POLY_CHECKIN_BASE, true, 35)), false)
})

test('polygon check-in cushion is the tight cap regardless of how fuzzy the fix is', () => {
  // The cushion can never exceed the polygon cap, so a 500m "precise-off" fix
  // widens the fence by at most 12m, not 500m.
  assert.equal(effectiveCheckinMargin(POLY_CHECKIN_BASE, true, 500), POLY_CHECKIN_BASE + CHECKIN_ACCURACY_CAP_POLYGON_M)
})

// ── Circle venue: unchanged, stays forgiving ─────────────────────────────────

test('circle: the generous cushion is unchanged (old iPhones still get in)', () => {
  // A fuzzy fix just past the radius still checks in — circle venues keep the 35m
  // cap because they have no footprint to lean on.
  const justPast = eastOf(40) // 5m past the 35m radius
  assert.equal(withinZone(justPast, CIRCLE_VENUE, effectiveCheckinMargin(CIRCLE_CHECKIN_BASE, false, 35)), true)
  assert.equal(effectiveCheckinMargin(CIRCLE_CHECKIN_BASE, false, 100), CIRCLE_CHECKIN_BASE + CHECKIN_ACCURACY_CAP_CIRCLE_M)
})

// ── Eviction side is untouched (hysteresis preserved) ────────────────────────

test('polygon: presence/eviction stays loose — 30m out is still "present", only check-in tightened', () => {
  const acrossLot = eastOf(45) // 30m past the wall
  // Cannot check in from here (tight): margin 8 + 12 = 20, dist 30 -> out.
  assert.equal(withinZone(acrossLot, POLY_VENUE, effectiveCheckinMargin(POLY_CHECKIN_BASE, true, 35)), false)
  // But if already inside, NOT evicted from here: presence margin 25 + 35 = 60.
  assert.equal(withinZone(acrossLot, POLY_VENUE, effectivePresenceMargin(POLY_PRESENCE_BASE, 35)), true)
})
