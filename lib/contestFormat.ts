// Pure helpers for live contests: no Supabase, no React, so they have tests.
// See supabase/live_contests.sql for how contests work.

export type ContestStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'ended' | 'hidden'
export type EntryStatus = 'waiting' | 'up' | 'done' | 'no_show' | 'withdrawn' | 'removed'

/** A contest that ended stays on the venue page this long, so people can see who won. */
export const RESULTS_LINGER_MS = 24 * 60 * 60 * 1000

/**
 * A score the way people read it: 7.42 with suffix "s" is "7.42s", 1250 with
 * "pts" is "1,250 pts". A one-character suffix sits right against the number.
 */
export function formatScore(
  value: number | string | null | undefined,
  decimals: number,
  suffix: string,
): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return ''
  const places = Math.min(3, Math.max(0, Math.round(decimals)))
  const fixed = Math.abs(n).toFixed(places)
  const [whole, frac] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const number = `${n < 0 && Number(fixed) !== 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`
  const s = suffix.trim()
  if (!s) return number
  return s.length === 1 ? `${number}${s}` : `${number} ${s}`
}

/**
 * What the operator typed, as a number. Accepts "7.42", "7,42" (a comma
 * keyboard), "1:05.3" (minutes and seconds, read as 65.3) and a leading minus.
 * Returns null for anything that isn't a clean number.
 */
export function parseScoreInput(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '')
  if (!t) return null
  const clock = /^(\d+):([0-5]?\d)(?:[.,](\d+))?$/.exec(t)
  if (clock) {
    const minutes = Number(clock[1])
    const seconds = Number(`${clock[2]}.${clock[3] ?? '0'}`)
    return minutes * 60 + seconds
  }
  if (!/^-?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function ordinal(n: number): string {
  const v = Math.abs(Math.trunc(n))
  const tens = v % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  switch (v % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

/** "You're next" for the front of the line, "You're 3rd in line" after that. */
export function linePositionLabel(position: number | null | undefined): string {
  if (!position || position < 1) return ''
  return position === 1 ? "You're next" : `You're ${ordinal(position)} in line`
}

/** The short badge shown on cards and the hero. */
export function statusLabel(status: ContestStatus): string {
  switch (status) {
    case 'live': return 'LIVE'
    case 'scheduled': return 'COMING UP'
    case 'paused': return 'PAUSED'
    case 'ended': return 'FINAL'
    case 'draft': return 'DRAFT'
    case 'hidden': return 'HIDDEN'
  }
}

/**
 * Whether a contest belongs on the venue page for everyone. Drafts and hidden
 * contests only reach operators (the database already hides them from
 * everyone else); an ended one lingers a day so people can see the results.
 */
export function isPublicOnVenuePage(
  c: { status: ContestStatus; venue_approved: boolean; ended_at: string | null },
  now: number = Date.now(),
): boolean {
  if (!c.venue_approved) return false
  if (c.status === 'scheduled' || c.status === 'live' || c.status === 'paused') return true
  if (c.status === 'ended' && c.ended_at) {
    const ended = Date.parse(c.ended_at)
    return Number.isFinite(ended) && now - ended < RESULTS_LINGER_MS
  }
  return false
}

// ── Color ────────────────────────────────────────────────────────────────────

export const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: 'HereNow', hex: '#29B6F6' },
  { label: 'Lime',    hex: '#A3E635' },
  { label: 'Gold',    hex: '#F5B700' },
  { label: 'Ember',   hex: '#F97316' },
  { label: 'Rose',    hex: '#F43F5E' },
  { label: 'Violet',  hex: '#A855F7' },
  { label: 'Ice',     hex: '#E2E8F0' },
]

export const DEFAULT_ACCENT = '#29B6F6'

export function isHexColor(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s.trim())
}

/** "#7ac143" or "7AC143" to "#7AC143"; null when it isn't a 6-digit hex color. */
export function normalizeHex(s: string): string | null {
  const t = s.trim().replace(/^#?/, '#').toUpperCase()
  return isHexColor(t) ? t : null
}

/** The accent with an alpha byte, for tints: withAlpha('#29B6F6', 0.2) is '#29B6F633'. */
export function withAlpha(hex: string, alpha: number): string {
  const base = normalizeHex(hex) ?? DEFAULT_ACCENT
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return `${base}${a.toString(16).padStart(2, '0').toUpperCase()}`
}

/**
 * Dark or light text for a button filled with the accent, by WCAG relative
 * luminance, so a host's pale yellow and deep violet both stay readable.
 */
export function textOn(hex: string): '#050A15' | '#F8FAFC' {
  const base = normalizeHex(hex) ?? DEFAULT_ACCENT
  const channel = (i: number) => {
    const c = parseInt(base.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  // Contrast against near-black (#050A15, lum ~0.004) vs near-white (~0.95).
  const vsDark = (lum + 0.05) / (0.0035 + 0.05)
  const vsLight = (0.955 + 0.05) / (lum + 0.05)
  return vsDark >= vsLight ? '#050A15' : '#F8FAFC'
}

// ── Scoring presets for the setup screen ─────────────────────────────────────

export interface ScoringShape {
  score_label: string
  score_suffix: string
  score_decimals: number
  higher_wins: boolean
}

export const SCORING_PRESETS: { id: string; label: string; hint: string; shape: ScoringShape }[] = [
  { id: 'longest', label: 'Longest time', hint: 'Bull riding, planks, hangs',
    shape: { score_label: 'Time', score_suffix: 's', score_decimals: 2, higher_wins: true } },
  { id: 'fastest', label: 'Fastest time', hint: 'Races, speed rounds',
    shape: { score_label: 'Time', score_suffix: 's', score_decimals: 2, higher_wins: false } },
  { id: 'points',  label: 'Most points', hint: 'Darts, trivia, skee-ball',
    shape: { score_label: 'Points', score_suffix: 'pts', score_decimals: 0, higher_wins: true } },
  { id: 'count',   label: 'Most reps', hint: 'Pull-ups, cups, free throws',
    shape: { score_label: 'Reps', score_suffix: '', score_decimals: 0, higher_wins: true } },
]

/** Which preset a saved contest matches, or 'custom'. */
export function presetFor(shape: ScoringShape): string {
  const hit = SCORING_PRESETS.find((p) =>
    p.shape.score_label === shape.score_label &&
    p.shape.score_suffix === shape.score_suffix &&
    p.shape.score_decimals === shape.score_decimals &&
    p.shape.higher_wins === shape.higher_wins)
  return hit?.id ?? 'custom'
}

// ── Errors from the database, in words people can act on ────────────────────

const ERRORS: Record<string, string> = {
  not_signed_in:    'Sign in first.',
  not_allowed:      "You don't have access to do that.",
  no_venue:         'Pick a venue for this contest first.',
  title_required:   'Give the contest a name.',
  scoring_locked:   "Scores are already in, so who wins can't flip now.",
  user_not_found:   'No one on HereNow has that username.',
  bad_status:       "That isn't a valid step for this contest.",
  not_running:      "The contest isn't running. Set it to Live first.",
  cannot_call:      "That person can't be called up right now.",
  cannot_score:     "That person isn't in the contest anymore.",
  no_attempts_left: 'They have used all their attempts. Void one to give a re-do.',
  cannot_score_self: "You can't score your own turn. Another operator has to.",
  bad_score:        "That score doesn't look like a number.",
  not_open:         "This contest isn't taking signups.",
  signups_closed:   'Signups are closed right now.',
  not_checked_in:   'Check in here to sign up.',
  full:             'This contest is full.',
  removed:          'The host removed you from this contest.',
  contests_accent_hex: 'Colors need to be a 6-digit hex code, like #29B6F6.',
}

/** The friendly message for a Supabase error, falling back to a generic one. */
export function contestErrorMessage(raw: string | null | undefined): string {
  if (!raw) return 'Something went wrong. Try again.'
  for (const [code, msg] of Object.entries(ERRORS)) {
    // Whole word, so "full" doesn't fire on "successfully".
    if (new RegExp(`\\b${code}\\b`).test(raw)) return msg
  }
  if (/check constraint/i.test(raw)) return 'One of those fields is too long or out of range.'
  if (/network|fetch|timeout/i.test(raw)) return 'No connection. Try again in a moment.'
  return 'Something went wrong. Try again.'
}
