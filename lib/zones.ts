import { supabase } from './supabase'

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
}

export async function fetchNearbyZones(
  lat: number,
  lng: number,
  radiusKm = 50
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
  }
}

export async function searchZonesByName(query: string): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('id, name, description, radius_meters, center_lat, center_lng, member_count, post_count, chips, opening_hours, polygon_wkt, is_temporarily_closed, temporary_closure_message')
    .eq('is_active', true)
    .ilike('name', `%${query}%`)
    .limit(20)

  if (error) {
    console.error('[zones] searchZonesByName error:', error.message)
    return []
  }

  return (data ?? []).map(z => ({
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
  lng: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc('user_in_zone', {
    zone_id: zoneId,
    user_lat: lat,
    user_lng: lng,
  })

  if (error) return false
  return !!data
}
