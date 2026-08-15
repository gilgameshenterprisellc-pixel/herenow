import { supabase } from './supabase'
import { DISCOVERY_RADIUS_KM } from './format'

export interface Zone {
  id: string
  name: string
  description: string | null
  radius_meters: number
  distance_meters: number | null
  member_count: number
  post_count: number
  center_lat: number
  center_lng: number
  chips: string[]
  opening_hours: string | null
  next_event_title: string | null
  next_event_starts_at: string | null
  polygon_wkt: string | null
  is_temporarily_closed: boolean
  temporary_closure_message: string | null
  avatar_url: string | null
  banner_url: string | null
  category: string | null
  wait_time_minutes: number | null
  wait_time_updated_at: string | null
}

export async function fetchNearbyZones(
  lat: number,
  lng: number,
  // Defaults to the Nearby tab's discovery radius so a caller that omits it
  // can't silently reach 50km again. app/venue/network.tsx deliberately passes
  // a wider radius — that screen is a venue's city-wide network view, not
  // consumer discovery.
  radiusKm = DISCOVERY_RADIUS_KM
): Promise<Zone[]> {
  const { data, error } = await supabase.rpc('zones_near', {
    lat,
    lng,
    radius_km: radiusKm,
  })

  if (error) {
    console.error('[zones] fetchNearbyZones error:', error.message)
    return []
  }

  return data ?? []
}

export async function createZone(params: {
  name: string
  description?: string
  latitude: number
  longitude: number
  radiusMeters?: number
}): Promise<Zone | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // PostGIS geography point: ST_Point(lng, lat)
  const { data, error } = await supabase
    .from('zones')
    .insert({
      name: params.name,
      description: params.description ?? null,
      center: `POINT(${params.longitude} ${params.latitude})`,
      radius_meters: params.radiusMeters ?? 10,
      created_by: user.id,
    })
    .select('id, name, description, radius_meters, member_count, post_count')
    .single()

  if (error) {
    console.error('[zones] createZone error:', error.message)
    return null
  }

  return {
    ...data,
    distance_meters:           null,
    center_lat:                params.latitude,
    center_lng:                params.longitude,
    chips:                     [],
    opening_hours:             null,
    next_event_title:          null,
    next_event_starts_at:      null,
    polygon_wkt:               null,
    is_temporarily_closed:     false,
    temporary_closure_message: null,
    avatar_url:                null,
    banner_url:                null,
    category:                  null,
    wait_time_minutes:         null,
    wait_time_updated_at:      null,
  }
}

export async function searchZonesByName(query: string): Promise<Zone[]> {
  // Matches venue name OR any Vibe chip (e.g. "Espresso Martini"), via search_venues RPC.
  const { data, error } = await supabase.rpc('search_venues', { q: query })

  if (error) {
    console.error('[zones] searchZonesByName error:', error.message)
    return []
  }

  return ((data ?? []) as any[]).map((z: any) => ({
    ...z,
    distance_meters:           null,
    chips:                     z.chips ?? [],
    opening_hours:             z.opening_hours ?? null,
    next_event_title:          null,
    next_event_starts_at:      null,
    polygon_wkt:               z.polygon_wkt ?? null,
    is_temporarily_closed:     z.is_temporarily_closed ?? false,
    temporary_closure_message: z.temporary_closure_message ?? null,
  }))
}

export async function checkUserInZone(
  zoneId: string,
  lat: number,
  lng: number,
  // Metres of tolerance added to the geofence boundary. Check-in uses a small
  // margin (edge tolerance); presence verification uses a larger one (only evict
  // when clearly outside). Requires the margin_m param on user_in_zone (see
  // supabase/geofence_margin.sql) — must be applied before this ships.
  marginM = 0
): Promise<boolean | null> {
  // Returns null (not false) when the RPC itself fails. This distinction is
  // load-bearing: the presence verifier must treat "we couldn't determine it"
  // as 'unknown' and NOT as grounds to evict. Collapsing an error to false is
  // exactly what caused users to be booted mid-visit on a transient DB/SRID
  // error before (see supabase/fix_user_in_zone_srid.sql). A confirmed false
  // (data === false) still means "outside".
  const { data, error } = await supabase.rpc('user_in_zone', {
    zone_id: zoneId,
    user_lat: lat,
    user_lng: lng,
    margin_m: marginM,
  })

  if (error) {
    console.warn('[zones] user_in_zone RPC error:', error.message)
    return null
  }
  return data === true
}
