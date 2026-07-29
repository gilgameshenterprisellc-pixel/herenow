// Test-only model of HereNow's server-side geofence semantics, plus a GPS
// trace simulator. This lives under test/ (excluded from the app bundle and
// from `tsc`) on purpose: it mirrors what PostGIS user_in_zone() decides so we
// can simulate realistic (noisy) location traces and assert enter/stay/exit
// behavior without a live PostGIS. It is NOT what the app runs — the app calls
// the RPC — but it lets us pin the intended behavior and catch regressions in
// the margins / hysteresis / eviction rules.

export type LatLng = { lat: number; lng: number }

const EARTH_R = 6371008.8 // mean earth radius (m)
const DEG = Math.PI / 180
const M_PER_DEG_LAT = 111320

// True great-circle distance in meters (matches ST_Distance on geography well
// enough for venue-scale checks).
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG
  const dLng = (b.lng - a.lng) * DEG
  const la = a.lat * DEG, lb = b.lat * DEG
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Local east/north meters of p relative to origin (sub-meter accurate at venue
// scale). Used for planar point-to-segment distance.
function toEN(origin: LatLng, p: LatLng): { e: number; n: number } {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(origin.lat * DEG)
  return { e: (p.lng - origin.lng) * mPerDegLng, n: (p.lat - origin.lat) * M_PER_DEG_LAT }
}

// Offset a point by east/north meters.
export function offsetMeters(origin: LatLng, east: number, north: number): LatLng {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(origin.lat * DEG)
  return { lat: origin.lat + north / M_PER_DEG_LAT, lng: origin.lng + east / mPerDegLng }
}

// Ray-casting point-in-polygon on a ring (open or closed). Handles concave and
// non-convex rings correctly, which is the whole point of polygon geofencing.
export function pointInRing(pt: LatLng, ring: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat
    const xj = ring[j].lng, yj = ring[j].lat
    const hit = (yi > pt.lat) !== (yj > pt.lat) &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

function distPointSegMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const P = toEN(a, p)
  const B = toEN(a, b)
  const vx = B.e, vy = B.n
  const len2 = vx * vx + vy * vy
  let t = len2 === 0 ? 0 : (P.e * vx + P.n * vy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(P.e - t * vx, P.n - t * vy)
}

// 0 if inside the ring, else the shortest distance (m) to its boundary. Mirrors
// ST_Distance(polygon::geography, point) for the containment decision.
export function distanceToPolygonMeters(pt: LatLng, ring: LatLng[]): number {
  if (pointInRing(pt, ring)) return 0
  let min = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, distPointSegMeters(pt, ring[j], ring[i]))
  }
  return min
}

export interface ZoneModel {
  center: LatLng
  radiusMeters: number
  polygon?: LatLng[]
}

// Mirrors user_in_zone(zone, lat, lng, margin_m): polygon-first (inside, or
// within margin of the footprint), else circle (within radius + margin of
// center).
export function withinZone(pt: LatLng, zone: ZoneModel, marginM = 0): boolean {
  if (zone.polygon && zone.polygon.length >= 3) {
    return distanceToPolygonMeters(pt, zone.polygon) <= marginM
  }
  return haversineMeters(zone.center, pt) <= zone.radiusMeters + marginM
}

// ── GPS simulation ─────────────────────────────────────────────────────────

// Deterministic RNG (mulberry32) so every test run is reproducible.
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Fix { lat: number; lng: number; accuracy: number | null }

// One noisy GPS fix around a true position. Horizontal error is drawn up to
// ~accuracyM meters in a uniformly random direction; reported accuracy is
// accuracyM. accuracyM === null models "no usable fix".
export function simulateFix(truePos: LatLng, accuracyM: number | null, rand: () => number): Fix {
  if (accuracyM == null) return { lat: truePos.lat, lng: truePos.lng, accuracy: null }
  const r = accuracyM * (rand() * 0.9 + 0.1) // 10%..100% of the accuracy radius
  const ang = rand() * Math.PI * 2
  const p = offsetMeters(truePos, r * Math.cos(ang), r * Math.sin(ang))
  return { lat: p.lat, lng: p.lng, accuracy: accuracyM }
}

// A rectangular venue footprint of w x h meters centered on `center`, returned
// as a closed-ish ring (4 corners). Handy for building test venues.
export function rectVenue(center: LatLng, widthM: number, heightM: number): LatLng[] {
  const hw = widthM / 2, hh = heightM / 2
  return [
    offsetMeters(center, -hw, -hh),
    offsetMeters(center, hw, -hh),
    offsetMeters(center, hw, hh),
    offsetMeters(center, -hw, hh),
  ]
}
