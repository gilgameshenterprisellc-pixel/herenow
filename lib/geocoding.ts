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
  const query = `[out:json][timeout:10];(way["building"](around:75,${lat},${lng}););out geom;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) return null

    const json = await res.json()

    // Pick the way with the most geometry nodes — most detailed polygon
    const way = ((json.elements ?? []) as any[])
      .filter((el) => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3)
      .sort((a, b) => b.geometry.length - a.geometry.length)[0]

    if (!way) return null

    // OSM: {lat, lon} pairs → PostGIS WKT uses (lng lat) order
    const coords: [number, number][] = way.geometry.map((n: any) => [n.lon, n.lat])

    // Close the ring if not already closed (PostGIS requires this)
    const [f0, f1] = coords[0]
    const [l0, l1] = coords[coords.length - 1]
    if (f0 !== l0 || f1 !== l1) coords.push([f0, f1])

    const wkt = `POLYGON((${coords.map(([lo, la]) => `${lo} ${la}`).join(', ')}))`

    return { wkt, pointCount: coords.length, osmId: way.id as number }
  } catch {
    return null
  }
}

// Fallback when Mapbox token not configured — lower precision, no confidence score
async function geocodeNominatim(
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
