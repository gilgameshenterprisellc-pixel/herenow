/**
 * Single source of truth for the dark basemap.
 *
 * CARTO's keyless tile endpoint is watermarked: every tile comes back as a
 * normal 200 with "API KEY REQUIRED" stamped diagonally across it, so nothing
 * throws, no request fails, and the map quietly brands itself unlicensed. A key
 * is free (5M tile requests/month, no approval queue) and restores the exact
 * black basemap the app was designed around.
 *
 * This lives in one module because the last fix did not. PRs #264/#265 added the
 * key to the native map and left both web call sites on the keyless URL, so the
 * watermark stayed on herenow-pi.vercel.app -- which is where essentially
 * everyone actually looks at the map. Two files drifted from one because the
 * URL was written out three times. Now it is written once.
 *
 * Requires EXPO_PUBLIC_CARTO_KEY. EXPO_PUBLIC_* vars are inlined at build time,
 * so it must be set in the Vercel project settings, not only in .env.local, or
 * the deployed bundle falls back.
 */

export const CARTO_KEY = process.env.EXPO_PUBLIC_CARTO_KEY ?? ''

/** Keyed CARTO dark tiles, or null when no key is configured. */
export const DARK_TILE_URL: string | null = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_KEY}`
  : null

/**
 * Web fallback when no key is set. Deliberately NOT CARTO: a missing or
 * misspelt env var must never be able to put the watermark back. The worst case
 * is a plainer map, not a branded one -- the same rule the native map follows,
 * where it falls back to Apple's basemap.
 *
 * OSM's standard tiles are light, so they are darkened with a CSS filter to stay
 * in keeping with the app.
 */
const FALLBACK_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const FALLBACK_CLASS    = 'hn-basemap-fallback'
const STYLE_ID          = 'hn-basemap-style'

/** Required by CARTO's and OSM's terms whenever their tiles are on screen. */
export const BASEMAP_ATTRIBUTION = DARK_TILE_URL
  ? '&copy; CARTO &copy; OpenStreetMap'
  : '&copy; OpenStreetMap'

/**
 * Injects the styles the basemap needs: the fallback darkening filter, and a
 * dark treatment for Leaflet's attribution box, which ships as a white chip and
 * is otherwise glaring on a black map.
 */
function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${FALLBACK_CLASS} {
      filter: invert(1) hue-rotate(180deg) brightness(0.82) contrast(0.9) saturate(0.5);
    }
    .leaflet-control-attribution {
      background: rgba(6, 13, 26, 0.72) !important;
      color: rgba(255, 255, 255, 0.45) !important;
      font-size: 10px !important;
      padding: 2px 6px !important;
    }
    .leaflet-control-attribution a {
      color: rgba(255, 255, 255, 0.6) !important;
    }
  `
  document.head.appendChild(style)
}

/**
 * Adds the dark basemap to a Leaflet map, keyed when a key exists and never an
 * unkeyed CARTO request otherwise. Web only -- every call site is a .web file.
 *
 * Callers should create the map with `attributionControl: true` so the credit
 * this passes actually renders.
 */
export function addDarkBasemap(L: any, map: any, maxZoom = 19): void {
  injectStyles()

  if (DARK_TILE_URL) {
    L.tileLayer(DARK_TILE_URL, { maxZoom, attribution: BASEMAP_ATTRIBUTION }).addTo(map)
    return
  }

  L.tileLayer(FALLBACK_TILE_URL, {
    maxZoom,
    attribution: BASEMAP_ATTRIBUTION,
    className: FALLBACK_CLASS,
  }).addTo(map)
}
