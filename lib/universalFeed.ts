// The Universal Feed (Jacob, Oct 29): a venue can send up to 3 broadcasts per
// rolling 7 days to everyone in its city, beyond its followers and tonight's
// guests. City-specific, and free for now.
//
// The database enforces the limit (supabase/universal_feed_oct30.sql); these
// numbers must match it. Pure (no Supabase) so it can be tested with node --test.

export const UNIVERSAL_FEED_WEEKLY_LIMIT = 3
export const UNIVERSAL_FEED_WINDOW_DAYS = 7
const WINDOW_MS = UNIVERSAL_FEED_WINDOW_DAYS * 86_400_000

export interface City {
  slug: string
  name: string
  lat: number
  lng: number
  radius_km: number
}

/** How many of this week's slots are left, and when the next one frees up. */
export function slotsLeft(sentAt: string[], now: Date = new Date()): { left: number; nextOpensAt: Date | null } {
  const inWindow = sentAt
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t) && t > now.getTime() - WINDOW_MS)
    .sort((a, b) => a - b)
  const left = Math.max(0, UNIVERSAL_FEED_WEEKLY_LIMIT - inWindow.length)
  // Full: the oldest one in the window ages out first.
  const nextOpensAt = left === 0 ? new Date(inWindow[inWindow.length - UNIVERSAL_FEED_WEEKLY_LIMIT] + WINDOW_MS) : null
  return { left, nextOpensAt }
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** The nearest city whose radius covers the point, matching city_for_point() in SQL. */
export function cityForPoint(lat: number, lng: number, cities: City[]): City | null {
  let best: City | null = null
  let bestKm = Infinity
  for (const c of cities) {
    const km = distanceKm(lat, lng, c.lat, c.lng)
    if (km <= Number(c.radius_km) && km < bestKm) { best = c; bestKm = km }
  }
  return best
}

/** Turn the guard's error codes into words a venue owner can act on. */
export function universalFeedError(message: string | undefined, cityName: string | null): string | null {
  if (!message) return null
  if (message.includes('universal_feed_limit')) {
    return `You've used all ${UNIVERSAL_FEED_WEEKLY_LIMIT} ${cityName ?? 'city'} feed posts this week.`
  }
  if (message.includes('universal_feed_needs_everyone')) {
    return 'Subscriber-only posts can\'t go to the city feed. Switch "Who sees this?" to All followers.'
  }
  if (message.includes('universal_feed_no_city')) {
    return 'Your venue isn\'t in a city with a Universal Feed yet.'
  }
  return null
}
