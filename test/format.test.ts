import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDistance,
  DISCOVERY_RADIUS_MILES,
  DISCOVERY_RADIUS_KM,
  METERS_PER_MILE,
} from '../lib/format.ts'

// Jacob (Aug 12): miles read better than km for US users, and "2 venues within
// 50km" undersells the network during the pilot. Distances are US units now.

test('close range reads in feet, not a rounded-to-zero mileage', () => {
  assert.equal(formatDistance(0), '0 ft')
  assert.equal(formatDistance(30), '98 ft')
  // Just under a tenth of a mile is still feet.
  assert.equal(formatDistance(160), '525 ft')
})

test('a tenth of a mile is where miles take over', () => {
  assert.equal(formatDistance(METERS_PER_MILE * 0.1), '0.1 mi')
})

test('mid range keeps one decimal', () => {
  assert.equal(formatDistance(METERS_PER_MILE), '1.0 mi')
  assert.equal(formatDistance(METERS_PER_MILE * 2.5), '2.5 mi')
  assert.equal(formatDistance(METERS_PER_MILE * 9.9), '9.9 mi')
})

test('past ten miles the decimal is noise, so it rounds', () => {
  assert.equal(formatDistance(METERS_PER_MILE * 10), '10 mi')
  assert.equal(formatDistance(METERS_PER_MILE * 42.4), '42 mi')
})

test('a missing or nonsense distance renders nothing rather than NaN', () => {
  assert.equal(formatDistance(NaN), '')
  assert.equal(formatDistance(-1), '')
  assert.equal(formatDistance(Infinity), '')
})

test('the discovery radius is 10 miles, and the km conversion matches it', () => {
  assert.equal(DISCOVERY_RADIUS_MILES, 10)
  // ~16.09km. Off-by-a-unit here would quietly widen or shrink the whole map.
  assert.ok(Math.abs(DISCOVERY_RADIUS_KM - 16.09344) < 0.001)
})
