// Wording for the App Store rows of the Pilot Dashboard funnel. Pure, so it is
// tested in test/app-store-note.test.ts. Dates are built by hand: re-parsing a
// date string is what broke "Your Nights" on Hermes (see lib/nights.ts).

export interface AppStoreNoteInput {
  connected:   boolean
  redownloads: number
  sources:     { source: string; first_downloads: number; redownloads: number; page_views: number }[]
  latest_day:  string | null
  last_error:  string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// '2026-10-16' -> 'Oct 16'. Anything else comes back unchanged.
export function shortDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const month = MONTHS[Number(m[2]) - 1]
  return month ? `${month} ${Number(m[3])}` : ymd
}

// "App Store search 4 · Web referrer 3", biggest first, sources with no
// first-time downloads left out.
export function downloadSources(sources: AppStoreNoteInput['sources'], max = 4): string {
  return sources
    .filter((s) => s.first_downloads > 0)
    .sort((a, b) => b.first_downloads - a.first_downloads || a.source.localeCompare(b.source))
    .slice(0, max)
    .map((s) => `${s.source} ${s.first_downloads}`)
    .join(' · ')
}

// The lines under the App Store rows. Never empty: when the sync is not set up
// it says where to look instead.
export function appStoreNote(a: AppStoreNoteInput | null): string[] {
  if (!a || !a.connected) {
    const lines = [
      'App Store page views and downloads show here once the Apple sync is set up. ' +
      'Until then, see App Store Connect, Analytics.',
    ]
    if (a?.last_error) lines.push(`Apple sync failed: ${a.last_error}`)
    return lines
  }
  const lines: string[] = []
  if (!a.latest_day) {
    lines.push('Connected to Apple. The first reports take one to two days to arrive.')
  } else {
    lines.push(
      `From Apple, through ${shortDay(a.latest_day)}. Apple's numbers arrive one to two days late, ` +
      'and Apple may hide very small counts.',
    )
  }
  const reinstalls = a.redownloads > 0
    ? ` (${a.redownloads} ${a.redownloads === 1 ? 'reinstall' : 'reinstalls'} left out)`
    : ''
  lines.push(
    `Downloads count new people only${reinstalls}. ` +
    'Page views count every view of the App Store page, not people.',
  )
  const src = downloadSources(a.sources)
  if (src) lines.push(`Where downloads came from: ${src}.`)
  if (a.last_error) lines.push(`Last Apple sync failed: ${a.last_error}`)
  return lines
}
