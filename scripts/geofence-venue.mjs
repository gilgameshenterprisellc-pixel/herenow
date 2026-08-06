#!/usr/bin/env node
// geofence-venue.mjs — resolve a venue to a precise HereNow geofence.
//
// This is the operator tool behind every pilot venue. It runs the SAME pipeline
// the app uses at venue approval (lib/geocoding.ts), so what you preview here is
// exactly what user_in_zone() will gate on:
//
//   1. Geocode the address with Nominatim (NOT Mapbox). Nominatim derives its
//      coordinates from OSM itself, so they land on/near the building footprint
//      in OSM — Mapbox returns a street-center point that sits meters off the
//      building and makes the footprint pick less reliable.
//   2. Fetch candidate footprints from Overpass around that point.
//   3. Pick the footprint that IS the venue (containment-dominant scoring, size
//      cap to reject parcels/blocks) — a verbatim port of pickBestPolygon() so
//      the preview can't drift from the app.
//   4. Emit ready-to-run SQL: a polygon zone when a good footprint exists, a
//      circle zone when it doesn't (never guess a footprint).
//
// The DB has a BEFORE-write trigger (geofence_hardening.sql) that runs
// ST_MakeValid + ST_CollectionExtract on any polygon, so winding order and minor
// self-intersections are repaired on insert — we still emit a clean closed ring.
//
// Usage:
//   node scripts/geofence-venue.mjs                 # run the built-in pilot list
//   node scripts/geofence-venue.mjs "Name|street|city|state|zip" ["Name2|..."]
//   node scripts/geofence-venue.mjs --lat 37.33 --lng -122.03 --name "Apple Park" --radius 60
//
// Output is a human report on stderr and a single SQL block on stdout, so:
//   node scripts/geofence-venue.mjs > venues.sql
//
// No API keys required. Nominatim + Overpass are public; we honor their rate
// limits (1 req/sec to Nominatim, sequential Overpass calls, descriptive UA).

const UA = 'HereNow/1.0 (herenow.app; venue geofencing)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => process.stderr.write(a.join(' ') + '\n')

// ── The pilot list (edit here, or pass venues on the CLI) ─────────────────────
// kind: 'polygon' tries for a real footprint (precise, tight check-in);
//       'circle'  forces a reliable circle of `radius` m (use for live demos
//                 where a check-in MUST succeed in front of a prospect).
const PILOT = [
  { name: 'Martha My Dear', street: '2503 Gallatin Ave', city: 'Nashville', state: 'TN', zip: '37206', kind: 'polygon' },
  { name: 'Lost and Found', street: '3104 Gallatin Pike', city: 'Nashville', state: 'TN', zip: '37216', kind: 'circle', radius: 35 },
  { name: 'The 5 Spot',     street: '1008 Forest Ave',    city: 'Nashville', state: 'TN', zip: '37206', kind: 'circle', radius: 35 },
  // Apple App Review is done from Cupertino. A geofenced venue at Apple Park +
  // the demo account lets the reviewer actually check in and see the room.
  { name: 'HereNow Demo (Apple Park)', lat: 37.334606, lng: -122.008972, city: 'Cupertino', state: 'CA', zip: '95014', kind: 'circle', radius: 120 },
]

// ── Geocoding (Nominatim) ─────────────────────────────────────────────────────
async function geocode({ street, city, state, zip }) {
  const q = encodeURIComponent(`${street}, ${city}, ${state} ${zip}`)
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.[0]) return null
  return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), osmType: json[0].osm_type, osmId: json[0].osm_id, display: json[0].display_name }
}

// ── Footprint fetch (Overpass) — mirrors lib/geocoding.ts ─────────────────────
async function fetchBuildingPolygon(lat, lng) {
  const query =
    `[out:json][timeout:25];(` +
    `way["building"](around:220,${lat},${lng});` +
    `relation["building"](around:220,${lat},${lng});` +
    `way["amenity"](around:200,${lat},${lng});` +
    `way["shop"](around:200,${lat},${lng});` +
    `way["leisure"](around:200,${lat},${lng});` +
    `way["office"](around:200,${lat},${lng});` +
    `way["tourism"](around:200,${lat},${lng});` +
    `way["craft"](around:200,${lat},${lng});` +
    `way["name"](around:80,${lat},${lng});` +
    `);out geom;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const json = await res.json()
  const elements = json.elements ?? []

  const candidates = []
  for (const el of elements) {
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3) {
      candidates.push({ geometry: el.geometry, priority: el.tags?.building ? 3 : 1, osmId: el.id, tags: el.tags })
    } else if (el.type === 'relation') {
      const outer = (el.members ?? []).find((m) => m.role === 'outer' && Array.isArray(m.geometry) && m.geometry.length >= 3)
      if (outer) candidates.push({ geometry: outer.geometry, priority: 2, osmId: el.id, tags: el.tags })
    }
  }
  const best = pickBestPolygon(lat, lng, candidates)
  if (!best) return { candidates: candidates.length, best: null }
  return { candidates: candidates.length, best: { wkt: buildWkt(best.geometry), points: best.geometry.length, osmId: best.osmId, contains: best.contains, diagMeters: best.diagMeters, distMeters: best.centroidDistMeters, name: best.tags?.name } }
}

// ── Polygon selection — verbatim from lib/geocoding.ts ────────────────────────
const MAX_BUILDING_DIAGONAL_M = 250
const MAX_CENTROID_DISTANCE_M = 140

function pickBestPolygon(lat, lng, candidates) {
  let best = null
  for (const c of candidates) {
    const ring = c.geometry.map((n) => [n.lon, n.lat])
    const { centLat, centLng, diagMeters } = ringMetrics(ring)
    if (diagMeters > MAX_BUILDING_DIAGONAL_M) continue
    const contains = pointInRing(lng, lat, ring)
    const centroidDistMeters = metersBetween(lat, lng, centLat, centLng)
    if (!contains && centroidDistMeters > MAX_CENTROID_DISTANCE_M) continue
    const score = (contains ? 1_000_000 : 0) + c.priority * 100_000 - diagMeters * 50 - centroidDistMeters * 20
    if (!best || score > best.score) best = { ...c, contains, diagMeters, centroidDistMeters, score }
  }
  return best
}

function ringMetrics(ring) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity, sumLng = 0, sumLat = 0
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    sumLng += lng; sumLat += lat
  }
  return { centLng: sumLng / ring.length, centLat: sumLat / ring.length, diagMeters: metersBetween(minLat, minLng, maxLat, maxLng) }
}

function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function metersBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function buildWkt(nodes) {
  const coords = nodes.map((n) => [n.lon, n.lat])
  const [f0, f1] = coords[0], [l0, l1] = coords[coords.length - 1]
  if (f0 !== l0 || f1 !== l1) coords.push([f0, f1])
  return `POLYGON((${coords.map(([lo, la]) => `${lo} ${la}`).join(', ')}))`
}

// ── SQL emitters ──────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/'/g, "''")

function sqlPolygonZone(v, lat, lng, wkt) {
  return `-- ${esc(v.name)} — polygon geofence (tight check-in). points=${v._points}, footprint diag=${v._diag}m, contains=${v._contains}
INSERT INTO zones (name, description, center, center_lat, center_lng, radius_meters, is_active, building_polygon, polygon_source, polygon_wkt)
VALUES (
  '${esc(v.name)}', ${v.desc ? `'${esc(v.desc)}'` : 'NULL'},
  ST_GeographyFromText('POINT(${lng} ${lat})'), ${lat}, ${lng},
  10, true,
  ST_GeogFromText('${wkt}'), 'osm', '${wkt}'
)
ON CONFLICT DO NOTHING;`
}

function sqlUpdatePolygon(v, wkt) {
  return `-- ${esc(v.name)} — attach polygon to the EXISTING zone (tighten an already-created venue).
-- The repair trigger validates + normalizes to MULTIPOLYGON on write.
UPDATE zones SET
  building_polygon = ST_GeogFromText('${wkt}'),
  polygon_source   = 'osm',
  polygon_wkt      = '${wkt}',
  radius_meters    = 10   -- radius is ignored once a polygon exists; keep the UI honest
WHERE name = '${esc(v.name)}';`
}

function sqlCircleZone(v, lat, lng, radius) {
  return `-- ${esc(v.name)} — circle geofence, ${radius}m radius (reliable check-in; no footprint needed).
INSERT INTO zones (name, description, center, center_lat, center_lng, radius_meters, is_active)
VALUES (
  '${esc(v.name)}', ${v.desc ? `'${esc(v.desc)}'` : 'NULL'},
  ST_GeographyFromText('POINT(${lng} ${lat})'), ${lat}, ${lng},
  ${radius}, true
)
ON CONFLICT DO NOTHING;`
}

// ── CLI parse ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  if (argv.length === 0) return { venues: PILOT }
  // flag form: --lat --lng --name --radius [--polygon]
  if (argv[0].startsWith('--')) {
    const o = {}
    for (let i = 0; i < argv.length; i += 2) o[argv[i].slice(2)] = argv[i + 1]
    return { venues: [{ name: o.name ?? 'Venue', lat: parseFloat(o.lat), lng: parseFloat(o.lng), kind: o.polygon !== undefined ? 'polygon' : 'circle', radius: o.radius ? parseInt(o.radius) : 35 }] }
  }
  // "Name|street|city|state|zip" pipe form
  return {
    venues: argv.map((s) => {
      const [name, street, city, state, zip] = s.split('|')
      return { name, street, city, state, zip, kind: 'polygon' }
    }),
  }
}

async function main() {
  const { venues } = parseArgs(process.argv.slice(2))
  const sqlBlocks = []
  log('HereNow geofence resolver — running the app pipeline (Nominatim + Overpass)\n')

  for (const v of venues) {
    let lat = v.lat, lng = v.lng
    log(`▶ ${v.name}`)

    if (lat == null || lng == null) {
      const g = await geocode(v)
      await sleep(1100) // Nominatim: <=1 req/sec
      if (!g) { log(`  ✗ could not geocode — skipping\n`); continue }
      lat = g.lat; lng = g.lng
      log(`  geocoded → ${lat}, ${lng}  (${g.osmType} ${g.osmId})`)
      log(`  ${g.display}`)
    } else {
      log(`  fixed coords → ${lat}, ${lng}`)
    }

    if (v.kind === 'polygon') {
      let poly = null
      try { poly = await fetchBuildingPolygon(lat, lng) } catch (e) { log(`  ! Overpass error: ${e.message}`) }
      await sleep(1200)
      if (poly?.best) {
        const b = poly.best
        v._points = b.points; v._diag = Math.round(b.diagMeters); v._contains = b.contains
        log(`  ✓ footprint: osm#${b.osmId}${b.name ? ` "${b.name}"` : ''} — ${b.points} pts, diag ${Math.round(b.diagMeters)}m, contains=${b.contains}, dist ${Math.round(b.distMeters)}m`)
        if (!b.contains) log(`  ⚠ geocoded point is NOT inside the chosen footprint — eyeball this one before shipping`)
        // New venue → INSERT with polygon. Existing (Martha) → UPDATE.
        const emitter = v.name === 'Martha My Dear' ? sqlUpdatePolygon(v, b.wkt) : sqlPolygonZone(v, lat, lng, b.wkt)
        sqlBlocks.push(emitter)
      } else {
        log(`  ✗ no usable footprint (candidates=${poly?.candidates ?? 0}) — falling back to a ${v.radius ?? 30}m circle`)
        sqlBlocks.push(sqlCircleZone(v, lat, lng, v.radius ?? 30))
      }
    } else {
      log(`  → circle ${v.radius}m (reliable-check-in mode)`)
      sqlBlocks.push(sqlCircleZone(v, lat, lng, v.radius))
    }
    log('')
  }

  process.stdout.write(
    `-- Generated by scripts/geofence-venue.mjs on ${new Date().toISOString()}\n` +
    `-- Review each block, then run in the Supabase SQL editor.\n` +
    `-- NOTE: 'center' and 'center_lat'/'center_lng' are BOTH set — the native\n` +
    `-- background geofence (hooks/useGeofenceTask.ts) reads the mirrored lat/lng.\n\n` +
    sqlBlocks.join('\n\n') + '\n'
  )
  log('SQL written to stdout.')
}

main().catch((e) => { log('FATAL: ' + e.stack); process.exit(1) })
