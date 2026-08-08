import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nightBucket, tzOffsetMs, NIGHT_TZ } from '../lib/nights.ts'

// "Your Nights" showed "Invalid Date" in the app but read correctly on the web
// (Jacob, build 24). The cause was re-parsing a localized date string:
// new Date(d.toLocaleString('en-US', { timeZone })) works in V8/JSC and returns
// Invalid Date on Hermes. These pin the replacement.

// A Nashville evening and the small hours that follow it are ONE night out.
const FRI_9PM_CDT  = '2026-08-08T02:00:00.000Z' // Fri Aug 7, 9:00pm CDT
const SAT_1AM_CDT  = '2026-08-08T06:00:00.000Z' // Sat Aug 8, 1:00am CDT
const SAT_5AM_CDT  = '2026-08-08T10:00:00.000Z' // Sat Aug 8, 5:00am CDT — still Friday night
const SAT_8PM_CDT  = '2026-08-09T01:00:00.000Z' // Sat Aug 8, 8:00pm CDT — a new night

test('the evening and the 1am after it are the same night', () => {
  assert.equal(nightBucket(SAT_1AM_CDT).key, nightBucket(FRI_9PM_CDT).key)
  assert.equal(nightBucket(SAT_1AM_CDT).label, nightBucket(FRI_9PM_CDT).label)
})

test('the night runs until 6am — 5am still belongs to the night before', () => {
  assert.equal(nightBucket(SAT_5AM_CDT).key, nightBucket(FRI_9PM_CDT).key)
})

test('the next evening is a different night', () => {
  assert.notEqual(nightBucket(SAT_8PM_CDT).key, nightBucket(FRI_9PM_CDT).key)
})

test('the label names the night the user actually went out', () => {
  // Not "Saturday" just because the check-out timestamp rolled past midnight.
  assert.equal(nightBucket(FRI_9PM_CDT).label, 'Friday, Aug 7')
  assert.equal(nightBucket(SAT_1AM_CDT).label, 'Friday, Aug 7')
  assert.equal(nightBucket(SAT_8PM_CDT).label, 'Saturday, Aug 8')
})

test('the label never reads "Invalid Date" and the key never carries NaN', () => {
  // The exact two symptoms Jacob saw. A NaN key is the reason every venue
  // collapsed into one undated card: every row hashed to "NaN-NaN-NaN".
  for (const iso of [FRI_9PM_CDT, SAT_1AM_CDT, SAT_5AM_CDT, SAT_8PM_CDT]) {
    const { key, label } = nightBucket(iso)
    assert.ok(!label.includes('Invalid'), `label was ${label}`)
    assert.ok(!key.includes('NaN'), `key was ${key}`)
  }
})

test('a missing or unparseable timestamp gets its own bucket, not a NaN one', () => {
  // Rows without a usable created_at must not merge into a real night.
  for (const bad of ['', 'not-a-date']) {
    const { key, label } = nightBucket(bad)
    assert.equal(key, 'undated')
    assert.ok(!label.includes('Invalid'))
  }
  assert.notEqual(nightBucket('').key, nightBucket(FRI_9PM_CDT).key)
})

test('regression: never re-parses a localized date string (the Hermes failure)', () => {
  // Node's V8 accepts "8/7/2026, 9:00:00 PM", so the broken construct passes
  // every test on a laptop and only fails on a phone. Stand in a stricter
  // parser — Hermes returns Invalid Date for anything that isn't ISO-8601 —
  // so reintroducing the round-trip fails here instead of in TestFlight.
  const RealDate = globalThis.Date
  const ISO_8601 = /^\d{4}-\d{2}-\d{2}T/
  class HermesDate extends RealDate {
    constructor(...args: any[]) {
      if (typeof args[0] === 'string' && !ISO_8601.test(args[0])) {
        super(NaN)
        return
      }
      // @ts-expect-error — forwarding a variadic Date constructor
      super(...args)
    }
  }
  globalThis.Date = HermesDate as any
  try {
    assert.equal(nightBucket(FRI_9PM_CDT).label, 'Friday, Aug 7')
    assert.equal(nightBucket(SAT_1AM_CDT).key, nightBucket(FRI_9PM_CDT).key)
  } finally {
    globalThis.Date = RealDate
  }
})

test('the grouping does not depend on the device timezone', () => {
  // Bucketing must be decided by Nashville wall-clock, never by where the phone
  // thinks it is. (The old code happened to satisfy this too — the localized
  // round-trip cancelled out — so this pins the property, it is not the bug.)
  const original = process.env.TZ
  const keys = new Set<string>()
  const labels = new Set<string>()
  for (const tz of ['UTC', 'America/Chicago', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland']) {
    process.env.TZ = tz
    keys.add(nightBucket(SAT_1AM_CDT).key)
    labels.add(nightBucket(SAT_1AM_CDT).label)
  }
  process.env.TZ = original
  assert.equal(keys.size, 1, `bucketed differently per device zone: ${[...keys].join(', ')}`)
  assert.equal(labels.size, 1)
})

test('tzOffsetMs tracks daylight saving', () => {
  // Nashville is UTC-5 in August (CDT) and UTC-6 in January (CST). A hardcoded
  // offset would put half the year's nights in the wrong bucket.
  assert.equal(tzOffsetMs(new Date('2026-08-08T02:00:00Z'), NIGHT_TZ), -5 * 3_600_000)
  assert.equal(tzOffsetMs(new Date('2026-01-08T02:00:00Z'), NIGHT_TZ), -6 * 3_600_000)
})
