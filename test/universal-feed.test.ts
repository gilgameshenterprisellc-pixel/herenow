import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotsLeft, cityForPoint, universalFeedError, defaultCity, type City } from '../lib/universalFeed.ts'

const NOW = new Date('2026-10-30T18:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

test('a venue gets 3 city feed posts per rolling 7 days', () => {
  assert.deepEqual(slotsLeft([], NOW), { left: 3, nextOpensAt: null })
  assert.equal(slotsLeft([daysAgo(1), daysAgo(2)], NOW).left, 1)
  // Older than 7 days no longer counts.
  assert.equal(slotsLeft([daysAgo(1), daysAgo(2), daysAgo(8)], NOW).left, 1)
})

test('when full, the next slot opens 7 days after the oldest one in the window', () => {
  const r = slotsLeft([daysAgo(1), daysAgo(6), daysAgo(3)], NOW)
  assert.equal(r.left, 0)
  assert.equal(r.nextOpensAt?.toISOString(), new Date(NOW.getTime() + 1 * 86_400_000).toISOString())
})

const NASHVILLE: City = { slug: 'nashville', name: 'Nashville', lat: 36.1627, lng: -86.7816, radius_km: 60 }
const CINCINNATI: City = { slug: 'cincinnati', name: 'Cincinnati', lat: 39.1031, lng: -84.512, radius_km: 60 }

test('a point belongs to the city whose radius covers it', () => {
  // East Nashville (Martha My Dear, 2503 Gallatin Ave)
  assert.equal(cityForPoint(36.2002, -86.7484, [NASHVILLE, CINCINNATI])?.slug, 'nashville')
  // Franklin, TN, about 30km south
  assert.equal(cityForPoint(35.9251, -86.8689, [NASHVILLE, CINCINNATI])?.slug, 'nashville')
  assert.equal(cityForPoint(39.1, -84.5, [NASHVILLE, CINCINNATI])?.slug, 'cincinnati')
})

test('outside every city means no city feed', () => {
  // Apple Park, where the App Review demo venue sits
  assert.equal(cityForPoint(37.3349, -122.009, [NASHVILLE, CINCINNATI]), null)
  assert.equal(cityForPoint(36.16, -86.78, []), null)
})

test('the guard\'s errors read as plain instructions', () => {
  assert.match(universalFeedError('universal_feed_limit', 'Nashville') ?? '', /all 3 Nashville feed posts/)
  assert.match(universalFeedError('P0001: universal_feed_needs_everyone', 'Nashville') ?? '', /All followers/)
  assert.equal(universalFeedError('some other error', 'Nashville'), null)
  assert.equal(universalFeedError(undefined, null), null)
})

test('with no location and no check-ins, one city is the default and two means ask', () => {
  assert.equal(defaultCity([NASHVILLE])?.slug, 'nashville')
  assert.equal(defaultCity([NASHVILLE, CINCINNATI]), null)
  assert.equal(defaultCity([]), null)
})
