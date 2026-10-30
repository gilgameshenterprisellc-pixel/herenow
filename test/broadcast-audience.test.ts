import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seesBroadcast, broadcastZoneIds, type BroadcastViewer } from '../lib/broadcastAudience.ts'

const BAR = 'bar'
const CAFE = 'cafe'
const TONIGHT = Date.parse('2026-10-30T11:00:00Z') // Fri 6am CDT
const EARLIER_TODAY = '2026-10-30T23:00:00Z'       // Fri 6pm CDT, tonight
const LAST_NIGHT = '2026-10-30T03:00:00Z'          // Thu 10pm CDT

function viewer(over: Partial<BroadcastViewer> = {}): BroadcastViewer {
  return { following: new Set(), subscribed: new Set(), checkedInZone: null, nightStartMs: TONIGHT, ...over }
}

test('followers see every broadcast, old or new', () => {
  const v = viewer({ following: new Set([BAR]) })
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, at: LAST_NIGHT }, v), true)
  assert.equal(seesBroadcast('promotion', { zone_id: BAR }, v), true)
  assert.equal(seesBroadcast('announcement', { zone_id: CAFE, at: EARLIER_TODAY }, v), false)
})

test('checked-in guests see tonight\'s announcements without following', () => {
  const v = viewer({ checkedInZone: BAR })
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, at: EARLIER_TODAY }, v), true)
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, at: LAST_NIGHT }, v), false)
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, at: null }, v), false)
})

test('checked-in guests see the venue\'s live promotions', () => {
  const v = viewer({ checkedInZone: BAR })
  assert.equal(seesBroadcast('promotion', { zone_id: BAR }, v), true)
  assert.equal(seesBroadcast('promotion', { zone_id: CAFE }, v), false)
})

test('subscribers-only broadcasts need a subscription, even in the room', () => {
  const guest = viewer({ checkedInZone: BAR, following: new Set([BAR]) })
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, audience: 'subscribers', at: EARLIER_TODAY }, guest), false)
  const sub = viewer({ following: new Set([BAR]), subscribed: new Set([BAR]) })
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, audience: 'subscribers', at: LAST_NIGHT }, sub), true)
})

test('muting a venue silences it, except tonight while you are there', () => {
  // A muted venue is left out of `following`, but the subscription itself stays.
  const away = viewer({ subscribed: new Set([BAR]) })
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, at: EARLIER_TODAY }, away), false)
  const here = viewer({ subscribed: new Set([BAR]), checkedInZone: BAR })
  assert.equal(seesBroadcast('announcement', { zone_id: BAR, at: EARLIER_TODAY }, here), true)
})

test('a venue you follow and are checked in to is fetched once', () => {
  assert.deepEqual(broadcastZoneIds(viewer({ following: new Set([BAR, CAFE]), checkedInZone: BAR })).sort(), [BAR, CAFE])
  assert.deepEqual(broadcastZoneIds(viewer({ checkedInZone: CAFE })), [CAFE])
  assert.deepEqual(broadcastZoneIds(viewer()), [])
})
