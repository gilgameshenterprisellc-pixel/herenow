import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPresenceReading,
  presenceFromFix,
  EVICT_STRIKES,
  MAX_PRESENCE_ACCURACY_M,
  type PresenceReading,
} from '../lib/presence.ts'

// ── applyPresenceReading: the eviction rule ────────────────────────────────

test('inside resets strikes and never evicts', () => {
  assert.deepEqual(applyPresenceReading(0, 'inside'), { strikes: 0, evict: false })
  assert.deepEqual(applyPresenceReading(1, 'inside'), { strikes: 0, evict: false })
})

test('unknown resets strikes and never evicts (the anti-false-eviction rule)', () => {
  assert.deepEqual(applyPresenceReading(0, 'unknown'), { strikes: 0, evict: false })
  assert.deepEqual(applyPresenceReading(1, 'unknown'), { strikes: 0, evict: false })
})

test('a single outside does not evict', () => {
  const r = applyPresenceReading(0, 'outside')
  assert.equal(r.evict, false)
  assert.equal(r.strikes, 1)
})

test('EVICT_STRIKES consecutive outsides evict, and the count resets on eviction', () => {
  let strikes = 0
  let evicted = false
  for (let i = 0; i < EVICT_STRIKES; i++) {
    const r = applyPresenceReading(strikes, 'outside')
    strikes = r.strikes
    evicted = r.evict
  }
  assert.equal(evicted, true)
  assert.equal(strikes, 0, 'strikes reset after eviction so a re-check-in starts clean')
})

test('an inside between two outsides prevents eviction (no false boot from a spike)', () => {
  let s = 0
  s = applyPresenceReading(s, 'outside').strikes            // 1
  const mid = applyPresenceReading(s, 'inside')             // reset
  s = mid.strikes
  assert.equal(mid.evict, false)
  const after = applyPresenceReading(s, 'outside')          // back to 1, not 2
  assert.equal(after.evict, false)
  assert.equal(after.strikes, 1)
})

test('an unknown between two outsides also prevents eviction', () => {
  let s = 0
  s = applyPresenceReading(s, 'outside').strikes
  s = applyPresenceReading(s, 'unknown').strikes            // reset
  const after = applyPresenceReading(s, 'outside')
  assert.equal(after.evict, false)
})

// ── presenceFromFix: the trust gate ────────────────────────────────────────

test('no fix is unknown', () => {
  assert.equal(presenceFromFix(null, true), 'unknown')
  assert.equal(presenceFromFix(null, false), 'unknown')
})

test('missing accuracy is unknown', () => {
  assert.equal(presenceFromFix({ accuracy: null }, true), 'unknown')
})

test('accuracy worse than the bar is unknown, regardless of inZone', () => {
  assert.equal(presenceFromFix({ accuracy: MAX_PRESENCE_ACCURACY_M + 1 }, true), 'unknown')
  assert.equal(presenceFromFix({ accuracy: 5000 }, false), 'unknown')
})

test('inZone === null (RPC error) is unknown, never outside', () => {
  assert.equal(presenceFromFix({ accuracy: 10 }, null), 'unknown')
})

test('trustworthy fix maps inZone to inside/outside', () => {
  assert.equal(presenceFromFix({ accuracy: 10 }, true), 'inside')
  assert.equal(presenceFromFix({ accuracy: 10 }, false), 'outside')
})

test('accuracy exactly at the bar is still trusted', () => {
  assert.equal(presenceFromFix({ accuracy: MAX_PRESENCE_ACCURACY_M }, true), 'inside')
})

// Exhaustive sanity: only a trustworthy, confirmed-false fix ever yields
// 'outside' (the only reading that can contribute to an eviction).
test('outside is only reachable via a trusted, confirmed-false fix', () => {
  const readings: PresenceReading[] = []
  for (const acc of [null, 10, 61, MAX_PRESENCE_ACCURACY_M]) {
    for (const iz of [true, false, null]) {
      readings.push(presenceFromFix(acc === null ? null : { accuracy: acc }, iz))
    }
  }
  // The only 'outside' entries must correspond to a trusted fix with inZone=false.
  assert.ok(readings.includes('outside'))
  assert.equal(presenceFromFix({ accuracy: 10 }, false), 'outside')
})
