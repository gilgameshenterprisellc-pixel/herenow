// ── Distance ────────────────────────────────────────────────────────────────
//
// Jacob (Aug 12): "Can we change the 'X venues within 50km' language to
// something like 'X venues within 10 miles'? Miles will be more intuitive for
// our initial U.S. users, and I also think 50km creates an optics problem
// during the pilot. If someone opens the app and sees '2 venues within 50km',
// it could make the network feel much smaller or less active than it actually
// is. A tighter radius makes the discovery experience feel more local."
//
// So the radius itself moves too, not just the wording — labelling a 50km fetch
// as "within 10 miles" would just be untrue.

export const METERS_PER_MILE = 1609.344

/** How far out the Nearby tab looks for venues. */
export const DISCOVERY_RADIUS_MILES = 10
export const DISCOVERY_RADIUS_KM = (DISCOVERY_RADIUS_MILES * METERS_PER_MILE) / 1000

/**
 * Distance for a US audience: feet up close, then miles.
 *
 * Feet below a tenth of a mile because "0.0 mi" reads as broken, and at that
 * range you are close enough that the precise number is what you want.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  const miles = meters / METERS_PER_MILE
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

// Show a person's name to OTHER people as first name + last initial, e.g.
// "Jacob Hillenbrand" -> "Jacob H." Single-word names are left as-is. Your own
// name is still shown in full on your own screens (Jacob feedback 6 — privacy).
export function publicName(name: string | null | undefined): string {
  if (!name) return 'Someone'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Someone'
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase()
  return lastInitial ? `${first} ${lastInitial}.` : first
}
