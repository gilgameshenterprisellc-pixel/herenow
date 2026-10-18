import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shortDay, downloadSources, appStoreNote } from '../lib/appStoreNote.ts'

// The lines under the App Store downloads row, the top of the Pilot Dashboard
// funnel (the pilot has no per-venue QR codes). Investors will read this, so it
// has to say plainly where the numbers come from and how late they are.

const base = {
  connected: true,
  redownloads: 0,
  page_views: 0,
  sources: [] as { source: string; first_downloads: number; redownloads: number; page_views: number }[],
  latest_day: '2026-10-16',
  last_error: null as string | null,
}

test('days read as "Oct 16" without re-parsing a date string', () => {
  assert.equal(shortDay('2026-10-16'), 'Oct 16')
  assert.equal(shortDay('2026-01-05'), 'Jan 5')
  assert.equal(shortDay('not a date'), 'not a date')
  assert.equal(shortDay('2026-13-01'), '2026-13-01')
})

test('download sources: biggest first, empty ones dropped', () => {
  assert.equal(downloadSources([
    { source: 'App Store search', first_downloads: 2, redownloads: 0, page_views: 9 },
    { source: 'Web referrer', first_downloads: 5, redownloads: 1, page_views: 4 },
    { source: 'App referrer', first_downloads: 0, redownloads: 3, page_views: 0 },
  ]), 'Web referrer 5 · App Store search 2')
})

test('before the sync is set up, the note says where to look instead', () => {
  assert.match(appStoreNote(null)[0], /App Store Connect, Analytics/)
  const failed = appStoreNote({ ...base, connected: false, last_error: 'secrets are not set' })
  assert.equal(failed.length, 2)
  assert.match(failed[1], /sync failed: secrets are not set/)
})

test('connected but no report yet says Apple takes a day or two', () => {
  assert.match(appStoreNote({ ...base, latest_day: null })[0], /first reports take one to two days/)
})

test('with data: the lag, the small-count caveat, reinstalls, page views and sources', () => {
  const lines = appStoreNote({
    ...base,
    redownloads: 2,
    page_views: 1240,
    sources: [{ source: 'Web referrer', first_downloads: 3, redownloads: 2, page_views: 10 }],
  })
  assert.equal(lines[0], "From Apple, through Oct 16. Apple's numbers arrive one to two days late, and Apple may hide very small counts.")
  assert.equal(lines[1], 'Downloads count new people only (2 reinstalls left out). The App Store page was viewed 1,240 times.')
  assert.equal(lines[2], 'Where downloads came from: Web referrer 3.')
  assert.equal(appStoreNote({ ...base, redownloads: 1, page_views: 1 })[1],
    'Downloads count new people only (1 reinstall left out). The App Store page was viewed 1 time.')
  assert.equal(appStoreNote(base)[1], 'Downloads count new people only.')
})

test('a failed latest sync is shown even when older data is there', () => {
  const lines = appStoreNote({ ...base, last_error: '401 NOT_AUTHORIZED' })
  assert.equal(lines[lines.length - 1], 'Last Apple sync failed: 401 NOT_AUTHORIZED')
})
