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
      radius_meters: params.radiusMeters ?? 75,
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
    distance_meters: null,
    center_lat: params.latitude,
    center_lng: params.longitude,
  }
}

export async function searchZonesByName(query: string): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('id, name, description, radius_meters, center_lat, center_lng, member_count, post_count')
    .eq('is_active', true)
    .ilike('name', `%${query}%`)
    .limit(20)

  if (error) {
    console.error('[zones] searchZonesByName error:', error.message)
    return []
  }

  return (data ?? []).map(z => ({ ...z, distance_meters: null }))
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
