const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ''

export const AUTO_APPROVE_THRESHOLD = 0.9

export interface GeocodeResult {
  lat:        number
  lng:        number
  confidence: number  // Mapbox relevance score 0–1
  placeName:  string
}

export async function geocodeAddress(
  address: string,
  suite:   string,
  city:    string,
  state:   string,
  zip:     string,
): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) {
    console.warn('[geocoding] EXPO_PUBLIC_MAPBOX_TOKEN not set — falling back to Nominatim')
    return geocodeNominatim(address, suite, city, state, zip)
  }

  const parts = [
    address.trim(),
    suite.trim() || null,
    city.trim(),
    `${state.trim()} ${zip.trim()}`,
  ].filter(Boolean)
  const query = encodeURIComponent(parts.join(', '))

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json` +
      `?access_token=${MAPBOX_TOKEN}&types=address&country=US&limit=1`,
    )
    const json = await res.json()
    const feature = json?.features?.[0]
    if (!feature) return null

    const [lng, lat] = feature.center as [number, number]
    return {
      lat,
      lng,
      confidence: feature.relevance ?? 0,
      placeName:  feature.place_name ?? '',
    }
  } catch (err) {
    console.error('[geocoding] Mapbox error:', err)
    return null
  }
}

// ── Building polygon from OpenStreetMap ───────────────────────────────────────
//
// Queries the Overpass API for building footprints within 75m of the given
// point. Returns the polygon as a PostGIS WKT string ready to pass to the DB.
// Non-fatal: if OSM has no data for the building, returns null and the zone
// falls back to the circle radius for check-in gating.

export interface BuildingPolygon {
  wkt:        string  // PostGIS WKT: POLYGON((lng lat, ...))
  pointCount: number
  osmId:      number
}

export async function fetchBuildingPolygon(
  lat: number,
  lng: number,
): Promise<BuildingPolygon | null> {
  // Broad search: catches buildings tagged with building=*, amenity=*, or leisure=*,
  // and closed ways with any tags (catches polygons the editor drew without a specific tag).
  // 200m radius handles Mapbox street-center geocoding offsets on dense city blocks.
  const query =
    `[out:json][timeout:15];` +
    `(` +
    `  way["building"](around:200,${lat},${lng});` +
    `  relation["building"](around:200,${lat},${lng});` +
    `  way["amenity"](around:100,${lat},${lng});` +
    `  way["leisure"](around:100,${lat},${lng});` +
    `);out geom;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) {
      console.error('[geocoding] Overpass HTTP error:', res.status, res.statusText)
      return null
    }

    const json = await res.json()
    const elements: any[] = json.elements ?? []
    console.log(`[geocoding] Overpass returned ${elements.length} element(s) near (${lat}, ${lng})`)

    // Collect every closed polygon candidate near the point, then choose the one
    // that best represents THIS venue — not just the biggest building nearby.
    // The old behavior picked the polygon with the most vertices within 200m,
    // which on corner lots grabbed a large neighboring building whose footprint
    // spilled toward the street, letting people check in from outside. We now
    // prefer the polygon that actually CONTAINS the venue point, then the nearest
    // reasonably-sized building, and skip anything too big to be a single venue.
    const candidates: PolygonCandidate[] = []
    for (const el of elements) {
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3) {
        // building-tagged ways outrank untagged amenity/leisure polygons
        candidates.push({ geometry: el.geometry, priority: el.tags?.building ? 3 : 1, osmId: el.id, tags: el.tags })
      } else if (el.type === 'relation') {
        const outer = (el.members ?? []).find(
          (m: any) => m.role === 'outer' && Array.isArray(m.geometry) && m.geometry.length >= 3
        )
        if (outer) candidates.push({ geometry: outer.geometry, priority: 2, osmId: el.id, tags: el.tags })
      }
    }

    const best = pickBestPolygon(lat, lng, candidates)
    if (best) {
      const wkt = buildWktFromNodes(best.geometry)
      if (wkt) {
        console.log(
          `[geocoding] Selected polygon osm#${best.osmId} ` +
          `(contains=${best.contains}, diag=${Math.round(best.diagMeters)}m, dist=${Math.round(best.centroidDistMeters)}m)`
        )
        return { wkt, pointCount: best.geometry.length, osmId: best.osmId }
      }
    }

    return null
  } catch (err) {
    console.error('[geocoding] fetchBuildingPolygon error:', err)
    return null
  }
}

function buildWktFromNodes(nodes: Array<{ lat: number; lon: number }>): string | null {
  if (!nodes || nodes.length < 3) return null
  // OSM: {lat, lon} pairs → PostGIS WKT uses (lng lat) order
  const coords: [number, number][] = nodes.map((n: any) => [n.lon, n.lat])
  // Close the ring if not already closed (PostGIS requires this)
  const [f0, f1] = coords[0]
  const [l0, l1] = coords[coords.length - 1]
  if (f0 !== l0 || f1 !== l1) coords.push([f0, f1])
  return `POLYGON((${coords.map(([lo, la]) => `${lo} ${la}`).join(', ')}))`
}

// ── Polygon selection ─────────────────────────────────────────────────────────
//
// Overpass returns every building/parcel near the point. We must pick the one
// that IS the venue, not just the biggest one nearby, or the geofence leaks into
// the street. Correctness of check-in gating depends entirely on this choice.

type OsmNode = { lat: number; lon: number }
interface PolygonCandidate { geometry: OsmNode[]; priority: number; osmId: number; tags: any }
interface ScoredPolygon extends PolygonCandidate {
  contains: boolean
  diagMeters: number
  centroidDistMeters: number
}

// A footprint whose bounding box spans more than this is almost certainly a whole
// parcel, block, or park — not a single venue. Never gate check-in on it.
const MAX_BUILDING_DIAGONAL_M = 250
// If the venue point isn't inside a building and sits farther than this from its
// center, it's the wrong building.
const MAX_CENTROID_DISTANCE_M = 140

function pickBestPolygon(lat: number, lng: number, candidates: PolygonCandidate[]): ScoredPolygon | null {
  let best: (ScoredPolygon & { score: number }) | null = null
  for (const c of candidates) {
    const ring: [number, number][] = c.geometry.map((n) => [n.lon, n.lat])
    const { centLat, centLng, diagMeters } = ringMetrics(ring)
    if (diagMeters > MAX_BUILDING_DIAGONAL_M) continue
    const contains = pointInRing(lng, lat, ring)
    const centroidDistMeters = metersBetween(lat, lng, centLat, centLng)
    if (!contains && centroidDistMeters > MAX_CENTROID_DISTANCE_M) continue
    // Containment dominates everything; then a real building tag; then prefer the
    // smaller, closer footprint (the specific venue over a sprawling neighbor).
    const score =
      (contains ? 1_000_000 : 0) +
      c.priority * 100_000 -
      diagMeters * 50 -
      centroidDistMeters * 20
    if (!best || score > best.score) {
      best = { ...c, contains, diagMeters, centroidDistMeters, score }
    }
  }
  return best
}

function ringMetrics(ring: [number, number][]) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  let sumLng = 0, sumLat = 0
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    sumLng += lng
    sumLat += lat
  }
  return {
    centLng: sumLng / ring.length,
    centLat: sumLat / ring.length,
    diagMeters: metersBetween(minLat, minLng, maxLat, maxLng),
  }
}

// Ray-casting point-in-polygon. ring is [lng, lat] pairs.
function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Haversine distance in meters.
function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Fallback when Mapbox token not configured — lower precision, no confidence score.
// Also used as a secondary coordinate source for polygon refresh: Nominatim derives
// coordinates from OSM data itself, so they land much closer to the actual building
// footprint in OSM than Mapbox street-center coordinates do.
export async function geocodeNominatim(
  address: string,
  suite:   string,
  city:    string,
  state:   string,
  zip:     string,
): Promise<GeocodeResult | null> {
  try {
    const street = suite.trim() ? `${address.trim()}, ${suite.trim()}` : address.trim()
    const q = encodeURIComponent(`${street}, ${city}, ${state} ${zip}`)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'HereNow/1.0 (herenow.app)' } },
    )
    const json = await res.json()
    if (!json?.[0]) return null
    return {
      lat:        parseFloat(json[0].lat),
      lng:        parseFloat(json[0].lon),
      confidence: 0.5,  // Nominatim has no confidence score; mark as medium
      placeName:  json[0].display_name ?? '',
    }
  } catch {
    return null
  }
}
