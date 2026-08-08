import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type LatLng, type ZoneModel, withinZone, offsetMeters, rectVenue, rng, simulateFix,
} from './geo-model.ts'
import { summarizeFixes, enoughSamples, SAMPLE_TARGET, type RawFix } from '../lib/fixSampling.ts'
import {
  effectiveCheckinMargin,
  checkinAccuracyCeiling,
  fixPreciseEnoughForCheckin,
  POLYGON_MAX_CHECKIN_ACCURACY_M,
  POLYGON_AGGREGATED_MAX_ACCURACY_M,
  POLYGON_TARGET_ACCURACY_M,
  MIN_SAMPLES_FOR_AGGREGATED_CEILING,
} from '../lib/geofenceTuning.ts'

// Jacob, build 24: the parked-truck refusal was right, but a lot of spots in the
// MIDDLE of the room wouldn't let him in, and force-quitting the app and trying
// again from the same spot sometimes would. That is a coin flip, not a fence
// problem: a single reading at indoor accuracy lands inside a bar-sized
// footprint about half the time. These tests pin the fix — median several
// readings instead of trusting one — and, more importantly, pin that it does
// not re-open the parked-car hole PR #246 closed.

// ── The aggregation itself ───────────────────────────────────────────────────

const fix = (lat: number, lng: number, accuracy: number | null = 10): RawFix =>
  ({ latitude: lat, longitude: lng, accuracy })

test('a single reading is passed through untouched, and says so', () => {
  const out = summarizeFixes([fix(36.1953, -86.7434, 12)])
  assert.equal(out?.latitude, 36.1953)
  assert.equal(out?.longitude, -86.7434)
  assert.equal(out?.accuracy, 12)
  assert.equal(out?.samples, 1, 'one reading must not claim corroboration')
})

test('no readings at all is null, not a bogus position', () => {
  assert.equal(summarizeFixes([]), null)
})

test('the position is the median, so one wild reading cannot drag it', () => {
  // Four readings clustered at 0 and one 100x further out.
  const out = summarizeFixes([
    fix(36.0000, -86.0000), fix(36.0001, -86.0001), fix(36.0002, -86.0002),
    fix(36.0003, -86.0003), fix(36.9000, -86.9000),
  ])
  // Mean would be dragged to ~36.18; median sits in the cluster.
  assert.ok(out!.latitude < 36.001, `median was dragged to ${out!.latitude}`)
  assert.equal(out!.samples, 5)
})

test('the coarse cell/wifi readings a phone opens with are dropped, not averaged in', () => {
  // The 1200m and 300m readings are a different (much worse) sensor. Letting
  // them into the median pulls the position toward the cell tower.
  const out = summarizeFixes([
    fix(36.9000, -86.9000, 1200),
    fix(36.5000, -86.5000, 300),
    fix(36.0000, -86.0000, 8),
    fix(36.0001, -86.0001, 9),
    fix(36.0002, -86.0002, 7),
  ])
  assert.equal(out!.samples, 3, 'only the converged readings should count')
  assert.ok(out!.latitude < 36.001, `coarse readings leaked into the median (${out!.latitude})`)
})

test('a tight best reading does not reject a merely good one', () => {
  // Additive slack: with a 2m best, a 6m reading is still the same sensor.
  const out = summarizeFixes([fix(36, -86, 2), fix(36.0001, -86.0001, 6)])
  assert.equal(out!.samples, 2)
})

test('only the most recent readings count, so walking in is judged on where you stopped', () => {
  // Six readings walking north; the last five are where the person ended up.
  const walk = Array.from({ length: 6 }, (_, i) => fix(36.0000 + i * 0.0001, -86.0000))
  const out = summarizeFixes(walk)
  assert.equal(out!.samples, SAMPLE_TARGET)
  // Median of readings 2..6, not 1..6 — strictly north of the overall midpoint.
  assert.ok(out!.latitude > 36.00025, `median included the start of the walk (${out!.latitude})`)
})

test('reported accuracy is the typical reading, not the luckiest one', () => {
  // Downstream reads this as "how much should I trust the position". Best-of
  // would flatter it: these three are all the same sensor, and 12 is not a fair
  // description of the set.
  const out = summarizeFixes([fix(36, -86, 12), fix(36, -86, 20), fix(36, -86, 21)])
  assert.equal(out!.samples, 3)
  assert.equal(out!.accuracy, 20)
})

test('one lucky tight reading is kept alone rather than blended with worse ones', () => {
  // Consequence of the same-sensor cutoff: next to a 5m reading, 20m looks like
  // a different sensor and is dropped. That leaves samples=1, so the position
  // faces the STRICT single-reading ceiling — which the 5m reading clears on its
  // own merits. Conservative in the right direction; noted so it isn't a
  // surprise when the field data shows samples=1 on good open-air check-ins.
  const out = summarizeFixes([fix(36, -86, 5), fix(36, -86, 20), fix(36, -86, 21)])
  assert.equal(out!.samples, 1)
  assert.equal(out!.accuracy, 5)
})

test('the sampler stops early on tight readings but waits for a crowd on fuzzy ones', () => {
  const tight = [fix(36, -86, 6), fix(36, -86, 7)]
  assert.equal(enoughSamples(tight, POLYGON_TARGET_ACCURACY_M), true, 'open-air check-in should stay quick')

  const fuzzy = [fix(36, -86, 14), fix(36, -86, 15)]
  assert.equal(enoughSamples(fuzzy, POLYGON_TARGET_ACCURACY_M), false, 'two fuzzy readings are not enough')

  const crowd = Array.from({ length: SAMPLE_TARGET }, () => fix(36, -86, 14))
  assert.equal(enoughSamples(crowd, POLYGON_TARGET_ACCURACY_M), true)
})

test('the sampler stops once the answer is settled, not when the window runs out', () => {
  // A steady 20m indoors will never reach the 15m target, but a full crowd at
  // 20m already clears the bar it will be judged by. Waiting out the rest of the
  // 15s window cannot change the outcome and just leaves the user on a spinner.
  const steady = Array.from({ length: SAMPLE_TARGET }, () => fix(36, -86, 20))
  assert.equal(enoughSamples(steady, POLYGON_TARGET_ACCURACY_M), false, 'target alone: keep trying')
  assert.equal(
    enoughSamples(steady, POLYGON_TARGET_ACCURACY_M, POLYGON_AGGREGATED_MAX_ACCURACY_M),
    true,
    'already good enough to decide on — stop',
  )

  // Genuinely too fuzzy to act on: keep watching for the whole window.
  const hopeless = Array.from({ length: SAMPLE_TARGET }, () => fix(36, -86, 55))
  assert.equal(
    enoughSamples(hopeless, POLYGON_TARGET_ACCURACY_M, POLYGON_AGGREGATED_MAX_ACCURACY_M),
    false,
  )
})

// ── The ceiling now depends on corroboration ─────────────────────────────────

test('a lone reading still faces the old strict bar (the parked-car fix stands)', () => {
  for (const fuzzy of [26, 40, 60, 90]) {
    assert.equal(fixPreciseEnoughForCheckin(fuzzy, true, 1), false)
  }
  assert.equal(checkinAccuracyCeiling(true, 1), POLYGON_MAX_CHECKIN_ACCURACY_M)
})

test('two readings are not a crowd — still the strict bar', () => {
  assert.ok(MIN_SAMPLES_FOR_AGGREGATED_CEILING > 2)
  assert.equal(checkinAccuracyCeiling(true, 2), POLYGON_MAX_CHECKIN_ACCURACY_M)
})

test('a corroborated position earns the looser bar, but not a blank cheque', () => {
  assert.equal(checkinAccuracyCeiling(true, SAMPLE_TARGET), POLYGON_AGGREGATED_MAX_ACCURACY_M)
  assert.equal(fixPreciseEnoughForCheckin(35, true, SAMPLE_TARGET), true)
  // Still refused well before "Precise Location is off" territory.
  assert.equal(fixPreciseEnoughForCheckin(60, true, SAMPLE_TARGET), false)
  assert.equal(fixPreciseEnoughForCheckin(500, true, SAMPLE_TARGET), false)
})

test('the sampler chases something tighter than it will settle for', () => {
  // Aiming at the ceiling makes the sampler stop the moment it scrapes past it.
  assert.ok(POLYGON_TARGET_ACCURACY_M < POLYGON_MAX_CHECKIN_ACCURACY_M)
  assert.ok(POLYGON_MAX_CHECKIN_ACCURACY_M < POLYGON_AGGREGATED_MAX_ACCURACY_M)
})

// ── End to end at Martha's real footprint ────────────────────────────────────
// The numbers quoted in lib/location.ts and lib/geofenceTuning.ts come from
// here. If someone retunes the dials, these fail rather than the venue.

const ANCHOR: LatLng = { lat: 36.1953, lng: -86.7434 }
const W = 29, H = 16 // Martha My Dear, from the OSM footprint
const MARTHA: ZoneModel = { center: ANCHOR, radiusMeters: 10, polygon: rectVenue(ANCHOR, W, H) }
const POLY_CHECKIN_BASE = 0
const northWall = H / 2

const DEAD_CENTRE    = ANCHOR
const TRUCK_OUT_FRONT = offsetMeters(ANCHOR, 0, northWall + 12)

// Run the real decision path: simulate readings, aggregate them the way
// lib/location.ts does, then apply the real ceiling + margin.
function checkinPassRate(truth: LatLng, accuracyM: number, samples: number, iterations = 4000): number {
  const rand = rng(20260808)
  let pass = 0
  for (let i = 0; i < iterations; i++) {
    const raw: RawFix[] = []
    for (let s = 0; s < samples; s++) {
      const f = simulateFix(truth, accuracyM, rand)
      raw.push({ latitude: f.lat, longitude: f.lng, accuracy: f.accuracy })
    }
    const agg = summarizeFixes(raw)!
    if (!fixPreciseEnoughForCheckin(agg.accuracy, true, agg.samples)) continue
    const margin = effectiveCheckinMargin(POLY_CHECKIN_BASE, true, agg.accuracy)
    if (withinZone({ lat: agg.latitude, lng: agg.longitude }, MARTHA, margin)) pass++
  }
  return pass / iterations
}

test('the middle of the room stops being a coin flip', () => {
  // This is Jacob's complaint. One reading at 25m accuracy: roughly half.
  const one = checkinPassRate(DEAD_CENTRE, 25, 1)
  assert.ok(one > 0.4 && one < 0.7, `expected a coin flip on one reading, got ${(one * 100).toFixed(0)}%`)

  // Medianed over five: reliable.
  const five = checkinPassRate(DEAD_CENTRE, 25, SAMPLE_TARGET)
  assert.ok(five > 0.85, `centre of the room should be reliable, got ${(five * 100).toFixed(0)}%`)
})

test('a fuzzy indoor reading no longer refuses the patron outright', () => {
  // 40m accuracy deep inside a building used to be hard-refused by the 25m
  // ceiling — 0%, no matter where you stood.
  assert.equal(checkinPassRate(DEAD_CENTRE, 40, 1), 0, 'a lone 40m reading must still be refused')
  assert.ok(
    checkinPassRate(DEAD_CENTRE, 40, SAMPLE_TARGET) > 0.5,
    'corroborated, it should mostly let a patron inside check in',
  )
})

test('the truck out front gets STRICTER, not looser — this is the whole point', () => {
  // The trade only holds if aggregating helps the patron more than the parking
  // lot. At the same accuracy the truck must not do better than it does today.
  const today    = checkinPassRate(TRUCK_OUT_FRONT, 25, 1)
  const withCrowd = checkinPassRate(TRUCK_OUT_FRONT, 25, SAMPLE_TARGET)
  assert.ok(withCrowd < today, `truck went from ${(today * 100).toFixed(0)}% to ${(withCrowd * 100).toFixed(0)}%`)
  assert.ok(withCrowd < 0.15, `truck out front should rarely get in, got ${(withCrowd * 100).toFixed(0)}%`)
})

test('raising the ceiling to 40m does not hand the parking lot a win', () => {
  // The looser ceiling only applies WITH corroboration, and at 40m corroborated
  // the truck still does no better than it already does at today's 25m bar.
  const truckToday = checkinPassRate(TRUCK_OUT_FRONT, 25, 1)
  const truckAt40  = checkinPassRate(TRUCK_OUT_FRONT, 40, SAMPLE_TARGET)
  assert.ok(
    truckAt40 <= truckToday,
    `40m corroborated (${(truckAt40 * 100).toFixed(0)}%) must not beat today's 25m bar (${(truckToday * 100).toFixed(0)}%)`,
  )
})

test('across the lot never gets in, at any accuracy or sample count', () => {
  const acrossLot = offsetMeters(ANCHOR, 0, northWall + 30)
  for (const acc of [15, 25, 40]) {
    for (const n of [1, SAMPLE_TARGET]) {
      const r = checkinPassRate(acrossLot, acc, n)
      assert.ok(r < 0.02, `30m out passed ${(r * 100).toFixed(1)}% at ${acc}m / ${n} samples`)
    }
  }
})
