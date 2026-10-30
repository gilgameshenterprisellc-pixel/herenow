import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partnerStatus, sortPartners, partnerWindowError } from '../lib/partnerStatus.ts'

const NOW = new Date('2026-11-06T02:00:00Z') // Thu Nov 5, 8pm CST
const h = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString()
const grant = (start: number, end: number, revoked = false) =>
  ({ starts_at: h(start), ends_at: h(end), revoked_at: revoked ? h(-1) : null })

test('a partnership is live only inside its window', () => {
  assert.equal(partnerStatus(grant(-1, 4), NOW), 'live')
  assert.equal(partnerStatus(grant(2, 6), NOW), 'upcoming')
  assert.equal(partnerStatus(grant(-8, -2), NOW), 'ended')
})

test('a revoked partnership is revoked, even inside its window', () => {
  assert.equal(partnerStatus(grant(-1, 4, true), NOW), 'revoked')
})

test('the list shows live first, then the next upcoming, then the most recent past', () => {
  const live = { id: 'live', ...grant(-1, 4) }
  const soon = { id: 'soon', ...grant(24, 30) }
  const later = { id: 'later', ...grant(72, 80) }
  const lastWeek = { id: 'lastWeek', ...grant(-170, -160) }
  const yesterday = { id: 'yesterday', ...grant(-26, -20) }
  assert.deepEqual(
    sortPartners([later, lastWeek, soon, yesterday, live], NOW).map((g) => g.id),
    ['live', 'soon', 'later', 'yesterday', 'lastWeek'],
  )
})

test('a new grant needs a real window that has not already passed', () => {
  const d = (n: number) => new Date(h(n))
  assert.match(partnerWindowError(null, d(2), NOW) ?? '', /Pick when/)
  assert.match(partnerWindowError(d(3), d(2), NOW) ?? '', /after the start/)
  assert.match(partnerWindowError(d(-5), d(-1), NOW) ?? '', /already over/)
  assert.equal(partnerWindowError(d(-1), d(4), NOW), null)
  assert.equal(partnerWindowError(d(24), d(30), NOW), null)
})
