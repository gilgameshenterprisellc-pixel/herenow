import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatScore,
  parseScoreInput,
  ordinal,
  linePositionLabel,
  statusLabel,
  isPublicOnVenuePage,
  RESULTS_LINGER_MS,
  normalizeHex,
  withAlpha,
  textOn,
  presetFor,
  SCORING_PRESETS,
  contestErrorMessage,
} from '../lib/contestFormat.ts'

test('scores read the way a host set them up', () => {
  assert.equal(formatScore(7.42, 2, 's'), '7.42s')
  assert.equal(formatScore('7.4', 2, 's'), '7.40s')
  assert.equal(formatScore(1250, 0, 'pts'), '1,250 pts')
  assert.equal(formatScore(12, 0, ''), '12')
  assert.equal(formatScore(1234567.5, 1, ''), '1,234,567.5')
  assert.equal(formatScore(-3, 0, 'pts'), '-3 pts')
  // A rounding that lands on zero shouldn't print "-0".
  assert.equal(formatScore(-0.001, 2, ''), '0.00')
})

test('a missing or broken score renders nothing rather than NaN', () => {
  assert.equal(formatScore(null, 2, 's'), '')
  assert.equal(formatScore(undefined, 2, 's'), '')
  assert.equal(formatScore('abc', 2, 's'), '')
  assert.equal(formatScore(Infinity, 0, ''), '')
})

test('decimals are clamped to what the database allows', () => {
  assert.equal(formatScore(1.23456, 9, ''), '1.235')
  assert.equal(formatScore(1.6, -1, ''), '2')
})

test('operator input: plain numbers, comma keyboards, and clock times', () => {
  assert.equal(parseScoreInput('7.42'), 7.42)
  assert.equal(parseScoreInput(' 7,42 '), 7.42)
  assert.equal(parseScoreInput('12'), 12)
  assert.equal(parseScoreInput('.5'), 0.5)
  assert.equal(parseScoreInput('-3'), -3)
  assert.equal(parseScoreInput('1:05.3'), 65.3)
  assert.equal(parseScoreInput('0:07'), 7)
  assert.equal(parseScoreInput('2:00'), 120)
})

test('operator input: anything else is refused, not guessed at', () => {
  for (const bad of ['', '   ', 'abc', '7.4.2', '1:75', '7s', '1e3', '--3', 'NaN', '1:2:3']) {
    assert.equal(parseScoreInput(bad), null, bad)
  }
})

test('ordinals, including the teens', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'])
})

test('place in line reads naturally', () => {
  assert.equal(linePositionLabel(1), "You're next")
  assert.equal(linePositionLabel(3), "You're 3rd in line")
  assert.equal(linePositionLabel(0), '')
  assert.equal(linePositionLabel(null), '')
})

test('every status has a badge', () => {
  for (const s of ['draft', 'scheduled', 'live', 'paused', 'ended', 'hidden'] as const) {
    assert.ok(statusLabel(s).length > 0)
  }
  assert.equal(statusLabel('live'), 'LIVE')
})

test('venue page: running contests show, results linger a day, drafts never', () => {
  const now = Date.parse('2026-10-24T03:00:00Z')
  const base = { venue_approved: true, ended_at: null as string | null }
  assert.equal(isPublicOnVenuePage({ ...base, status: 'live' }, now), true)
  assert.equal(isPublicOnVenuePage({ ...base, status: 'scheduled' }, now), true)
  assert.equal(isPublicOnVenuePage({ ...base, status: 'paused' }, now), true)
  assert.equal(isPublicOnVenuePage({ ...base, status: 'draft' }, now), false)
  assert.equal(isPublicOnVenuePage({ ...base, status: 'hidden' }, now), false)
  assert.equal(isPublicOnVenuePage({ ...base, status: 'live', venue_approved: false }, now), false)
  const justEnded = new Date(now - 60_000).toISOString()
  const longAgo = new Date(now - RESULTS_LINGER_MS - 1).toISOString()
  assert.equal(isPublicOnVenuePage({ ...base, status: 'ended', ended_at: justEnded }, now), true)
  assert.equal(isPublicOnVenuePage({ ...base, status: 'ended', ended_at: longAgo }, now), false)
  assert.equal(isPublicOnVenuePage({ ...base, status: 'ended', ended_at: null }, now), false)
})

test('host colors are normalized, tinted, and get readable button text', () => {
  assert.equal(normalizeHex('7ac143'), '#7AC143')
  assert.equal(normalizeHex(' #29b6f6 '), '#29B6F6')
  assert.equal(normalizeHex('green'), null)
  assert.equal(normalizeHex('#FFF'), null)
  assert.equal(withAlpha('#29B6F6', 0.2), '#29B6F633')
  assert.equal(withAlpha('#29B6F6', 1), '#29B6F6FF')
  assert.equal(withAlpha('nonsense', 0), '#29B6F600')
  // Pale accents get dark text, deep ones get light text.
  assert.equal(textOn('#A3E635'), '#050A15')
  assert.equal(textOn('#F5B700'), '#050A15')
  assert.equal(textOn('#E2E8F0'), '#050A15')
  assert.equal(textOn('#6D28D9'), '#F8FAFC')
  assert.equal(textOn('#1E3A8A'), '#F8FAFC')
})

test('a saved contest maps back to its scoring preset', () => {
  for (const p of SCORING_PRESETS) assert.equal(presetFor(p.shape), p.id)
  assert.equal(presetFor({ score_label: 'Pins', score_suffix: '', score_decimals: 0, higher_wins: true }), 'custom')
})

test('database errors become something a person can act on', () => {
  assert.equal(contestErrorMessage('not_checked_in'), 'Check in here to sign up.')
  assert.equal(contestErrorMessage('ERROR: full'), 'This contest is full.')
  assert.match(contestErrorMessage('new row violates check constraint "contests_title_len"'), /too long/)
  assert.match(contestErrorMessage('TypeError: Network request failed'), /connection/)
  assert.equal(contestErrorMessage(undefined), 'Something went wrong. Try again.')
  assert.equal(contestErrorMessage('weird internal thing'), 'Something went wrong. Try again.')
})
