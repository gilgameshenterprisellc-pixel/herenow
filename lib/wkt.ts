// The outline a venue's map shape is drawn from, read out of WKT text.
//
// zones.polygon_wkt is normally a plain POLYGON((lng lat, ...)), but PostGIS
// can also hand back a MULTIPOLYGON (((...)), ((...))) or a polygon with a
// hole, POLYGON((outer), (hole)). The old reader only matched the plain
// shape, so anything else drew no outline at all. This returns the first
// ring of the first polygon, which is the outer edge of the building.
//
// Display only: check-in gates on the building_polygon geography column in
// SQL, never on this text.
//
// Pure, no imports.

/** [lng, lat] pairs, in the order WKT lists them. Empty when there is no outline. */
export function wktOuterRing(wkt: string | null | undefined): [number, number][] {
  if (!wkt) return []
  // The first "((" that is followed directly by coordinates, up to its ")".
  const m = wkt.match(/\(\(\s*([^()]+?)\s*\)/)
  if (!m) return []
  return m[1].split(',').flatMap(pair => {
    const parts = pair.trim().split(/\s+/)
    const lng = parseFloat(parts[0])
    const lat = parseFloat(parts[1])
    return isNaN(lat) || isNaN(lng) ? [] : [[lng, lat] as [number, number]]
  })
}
