// "Is this venue open right now?" — derived from the hours a venue owner set.
//
// The catch: `zones.opening_hours` is a DISPLAY STRING, not structured data. The
// hours picker in app/venue/edit.tsx collapses a 7-day schedule into one human
// line via buildHoursText():
//
//   "Mon–Fri 5:00 PM–2:00 AM · Sat 6:00 PM–3:00 AM · Closed Sun"
//
// So this file parses that exact grammar back out. That is only safe because we
// emit it ourselves from one function — if buildHoursText ever changes shape,
// change the grammar here in the same commit and add a case to
// test/venue-hours.test.ts.
//
// Unparseable or missing hours return null, NOT false. "We don't know" and
// "closed" are different answers: a venue that never filled in hours must not
// render as closed on the map.

// Kept free of imports on purpose, like lib/presence.ts and lib/fixSampling.ts:
// the test runner loads these modules directly, and a relative import would need
// a `.ts` extension that tsc rejects without allowImportingTsExtensions.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type Day = typeof DAYS[number]

const DAY_INDEX: Record<string, number> = Object.fromEntries(
  DAYS.map((d, i) => [d.toLowerCase(), i])
)

export interface OpenWindow {
  /** Day indices this window starts on. 0 = Mon … 6 = Sun. */
  days: number[]
  /** Minutes past local midnight the venue opens. */
  from: number
  /** Minutes past local midnight it closes. `to <= from` means it runs past midnight. */
  to: number
}

// Day names are joined with an en dash by buildHoursText, but accept a hyphen or
// em dash too — hours can be hand-edited in the DB and one wrong dash should not
// silently blank out a venue's status.
const DASH = '[\\u2013\\u2014-]'
const DAY = '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)'
const TIME = '(\\d{1,2}:\\d{2}\\s*[AP]M)'

const OPEN_RE = new RegExp(`^${DAY}(?:${DASH}${DAY})?\\s+${TIME}${DASH}${TIME}$`, 'i')

/** "5:00 PM" → 1020. Returns null on anything that is not a 12-hour clock time. */
export function parseTime12(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])M$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 1 || h > 12 || min > 59) return null
  const isPM = m[3].toUpperCase() === 'P'
  if (h === 12) h = 0
  return (h + (isPM ? 12 : 0)) * 60 + min
}

/** Inclusive run of day indices from `start` to `end`, wrapping Sun → Mon. */
function dayRange(start: number, end: number): number[] {
  const out: number[] = []
  let i = start
  // Bounded by 7 so a malformed range can never spin forever.
  for (let guard = 0; guard < 7; guard++) {
    out.push(i)
    if (i === end) break
    i = (i + 1) % 7
  }
  return out
}

/**
 * Parse an opening_hours display string into open windows.
 * Returns null when nothing in the string is recognisable as hours.
 * "Closed X" segments are skipped — a day is closed by not appearing.
 */
export function parseOpeningHours(text: string | null | undefined): OpenWindow[] | null {
  if (!text || !text.trim()) return null

  const windows: OpenWindow[] = []
  // Tracks whether ANY segment was actually recognisable as hours. Free text
  // like "call ahead" must come back unknown, not closed — only a real "Closed"
  // segment or a real window counts as an answer.
  let sawRecognised = false

  for (const rawSeg of text.split('·')) {
    const seg = rawSeg.trim()
    if (!seg) continue

    // "Closed Sun" / "Closed Sat–Sun" carry no window; absence is what closes a day.
    if (/^closed\b/i.test(seg)) { sawRecognised = true; continue }

    const m = seg.match(OPEN_RE)
    if (!m) continue

    const startDay = DAY_INDEX[m[1].toLowerCase()]
    const endDay = m[2] ? DAY_INDEX[m[2].toLowerCase()] : startDay
    const from = parseTime12(m[3])
    const to = parseTime12(m[4])
    if (startDay === undefined || endDay === undefined || from === null || to === null) continue

    windows.push({ days: dayRange(startDay, endDay), from, to })
    sawRecognised = true
  }

  if (!sawRecognised) return null
  // An empty list here means every segment was "Closed …" — a real answer
  // (closed all week), not an unknown one.
  return windows
}

// Venues are Nashville for the pilot — the same assumption lib/nights.ts makes.
// Per-venue timezones land with multi-city.
export const VENUE_TZ = 'America/Chicago'

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
}

/**
 * Local wall-clock day (0 = Mon) and minutes past midnight, in `tz`.
 *
 * Reads the parts straight off Intl rather than round-tripping a Date through a
 * localized string — the same rule lib/nights.ts documents. `new Date(d
 * .toLocaleString(...))` works in V8/JSC and returns Invalid Date on Hermes,
 * which is what made "Your Nights" break in the app but not on the web.
 */
function localNow(at: Date, tz: string): { day: number; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>

  return {
    day: WEEKDAY_INDEX[parts.weekday] ?? 0,
    // hour12:false renders midnight as "24" on some ICU versions.
    minutes: (+parts.hour % 24) * 60 + +parts.minute,
  }
}

/** True / false / null (unknown) for "open right now". */
export function isOpenNow(
  hoursText: string | null | undefined,
  at: Date = new Date(),
  tz: string = VENUE_TZ
): boolean | null {
  const windows = parseOpeningHours(hoursText)
  if (windows === null) return null

  const { day, minutes } = localNow(at, tz)
  const yesterday = (day + 6) % 7

  for (const w of windows) {
    // from === to reads as open around the clock (a 24-hour venue), which is the
    // only sensible reading of "12:00 AM–12:00 AM".
    if (w.from === w.to && w.days.includes(day)) return true

    if (w.to > w.from) {
      // Ordinary same-day window.
      if (w.days.includes(day) && minutes >= w.from && minutes < w.to) return true
    } else {
      // Runs past midnight: the evening belongs to its own day, the small hours
      // to the morning after. A Sat 1 AM check has to consult Friday's window.
      if (w.days.includes(day) && minutes >= w.from) return true
      if (w.days.includes(yesterday) && minutes < w.to) return true
    }
  }

  return false
}
