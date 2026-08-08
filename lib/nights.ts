// Wall-clock time helpers that behave the same on Hermes and in a browser.
//
// The tempting one-liner for "what time is it in Nashville" is
//
//   new Date(d.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
//
// which round-trips a date through a localized STRING and parses it back. V8 and
// JSC happen to accept "8/7/2026, 9:30:00 PM"; Hermes does not, and returns
// Invalid Date. That is exactly why "Your Nights" read "Invalid Date" and piled
// every check-in into a single undated bucket in the app while the web build
// looked correct (Jacob, build 24). Never re-parse a formatted date string —
// read the parts directly.
//
// formatToParts is the only Intl surface needed here and it is well supported on
// both engines (iOS Hermes builds ship full ICU).

// Milliseconds to add to a UTC instant to get wall-clock time in `tz`.
export function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value])) as Record<string, string>
  // hour12:false can render midnight as "24" on some ICU versions.
  const hour = +p.hour % 24
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second)
  return asUTC - date.getTime()
}

// Venues are Nashville for now; per-venue timezones come with multi-city.
export const NIGHT_TZ = 'America/Chicago'

// A night out runs until 6am local — the same boundary the venue Pulse recap
// uses (lib/pulse.ts) — so an 8pm check-in and a 1am one land in the same night.
export const NIGHT_ROLLOVER_HOUR = 6

// Which "night out" an instant belongs to, plus the label to show for it.
// `key` is opaque and only used to group; `label` is what the user reads.
export function nightBucket(iso: string): { key: string; label: string } {
  const d = new Date(iso)
  // A row with a missing or unparseable timestamp gets its own bucket rather
  // than poisoning a real night's grouping with a NaN key.
  if (Number.isNaN(d.getTime())) return { key: 'undated', label: 'Earlier' }

  // Nashville wall-clock held in a UTC-based Date, shifted back 6h so pre-6am
  // counts as the night before. Read it back with getUTC* / timeZone:'UTC' —
  // the runtime's own zone must not enter into it.
  const wall = new Date(d.getTime() + tzOffsetMs(d, NIGHT_TZ) - NIGHT_ROLLOVER_HOUR * 3_600_000)
  return {
    key: `${wall.getUTCFullYear()}-${wall.getUTCMonth()}-${wall.getUTCDate()}`,
    label: wall.toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
    }),
  }
}
