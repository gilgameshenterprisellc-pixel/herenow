import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOpenNow, parseOpeningHours, parseTime12 } from '../lib/venueHours.ts'

// zones.opening_hours is a display string built by buildHoursText() in
// app/venue/edit.tsx. These pin the grammar it emits so the map's Live ring
// can't quietly start lying if that formatter changes.

const HOURS = 'Mon–Fri 5:00 PM–2:00 AM · Sat 6:00 PM–3:00 AM · Closed Sun'

// Nashville is CDT (UTC-5) in August.
const at = (iso: string) => new Date(iso)
const WED_9PM   = at('2026-08-13T02:00:00.000Z') // Wed Aug 12, 9:00pm CDT
const WED_3PM   = at('2026-08-12T20:00:00.000Z') // Wed Aug 12, 3:00pm CDT — before open
const THU_1AM   = at('2026-08-13T06:00:00.000Z') // Thu Aug 13, 1:00am CDT — Wed's tail
const THU_3AM   = at('2026-08-13T08:00:00.000Z') // Thu Aug 13, 3:00am CDT — after 2am close
const SUN_9PM   = at('2026-08-17T02:00:00.000Z') // Sun Aug 16, 9:00pm CDT — closed day
const SUN_2AM   = at('2026-08-16T07:00:00.000Z') // Sun Aug 16, 2:00am CDT — Sat's 3am tail

test('open during a plain evening window', () => {
  assert.equal(isOpenNow(HOURS, WED_9PM), true)
})

test('closed before the doors open', () => {
  assert.equal(isOpenNow(HOURS, WED_3PM), false)
})

test('the 1am after a 2am close is still open — the window runs past midnight', () => {
  assert.equal(isOpenNow(HOURS, THU_1AM), true)
})

test('3am is closed once the 2am window has run out', () => {
  assert.equal(isOpenNow(HOURS, THU_3AM), false)
})

test('a day listed as Closed is closed', () => {
  assert.equal(isOpenNow(HOURS, SUN_9PM), false)
})

test("Sunday 2am belongs to Saturday's window, not to closed Sunday", () => {
  assert.equal(isOpenNow(HOURS, SUN_2AM), true)
})

test('missing hours are unknown, not closed', () => {
  assert.equal(isOpenNow(null, WED_9PM), null)
  assert.equal(isOpenNow('', WED_9PM), null)
  assert.equal(isOpenNow('   ', WED_9PM), null)
})

test('unparseable hours are unknown, not closed', () => {
  assert.equal(isOpenNow('call ahead', WED_9PM), null)
  assert.equal(isOpenNow('whenever we feel like it', WED_9PM), null)
})

test('a week of Closed segments is a real answer: closed', () => {
  assert.equal(isOpenNow('Closed Mon–Sun', WED_9PM), false)
})

test('single-day segments parse', () => {
  assert.equal(isOpenNow('Wed 8:00 PM–11:00 PM', WED_9PM), true)
  assert.equal(isOpenNow('Tue 8:00 PM–11:00 PM', WED_9PM), false)
})

test('a day range that wraps past Sunday still covers its days', () => {
  // Sat–Mon covers Sat, Sun, Mon.
  const w = parseOpeningHours('Sat–Mon 5:00 PM–9:00 PM')
  assert.equal(w?.length, 1)
  assert.deepEqual(w?.[0].days, [5, 6, 0])
})

test('hyphens and em dashes parse the same as en dashes', () => {
  assert.equal(isOpenNow('Mon-Fri 5:00 PM-2:00 AM', WED_9PM), true)
  assert.equal(isOpenNow('Mon—Fri 5:00 PM—2:00 AM', WED_9PM), true)
})

test('one bad segment does not discard the good ones', () => {
  assert.equal(isOpenNow('Wed 8:00 PM–11:00 PM · kitchen closes early', WED_9PM), true)
})

test('equal open and close reads as open around the clock', () => {
  assert.equal(isOpenNow('Mon–Sun 12:00 AM–12:00 AM', WED_3PM), true)
})

test('12-hour clock edges convert correctly', () => {
  assert.equal(parseTime12('12:00 AM'), 0)
  assert.equal(parseTime12('12:30 PM'), 750)
  assert.equal(parseTime12('1:00 AM'), 60)
  assert.equal(parseTime12('11:59 PM'), 1439)
  assert.equal(parseTime12('13:00 PM'), null)
  assert.equal(parseTime12('nope'), null)
})
