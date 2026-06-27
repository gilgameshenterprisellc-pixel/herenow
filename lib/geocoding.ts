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
