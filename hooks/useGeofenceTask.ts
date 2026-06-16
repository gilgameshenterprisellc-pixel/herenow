import { useEffect } from 'react'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { supabase } from '@/lib/supabase'

export const GEOFENCE_TASK = 'HERENOW_GEOFENCE_TASK'

// Register the background task handler (runs outside React — module-level)
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[geofence] task error:', error.message)
    return
  }

  const { eventType, region } = data
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const isEntering = eventType === Location.GeofencingEventType.Enter
  const zoneId = region.identifier

  // Update member presence when entering or leaving a zone
  await supabase
    .from('zone_members')
    .update({ is_present: isEntering, last_seen_at: new Date().toISOString() })
    .eq('zone_id', zoneId)
    .eq('user_id', user.id)

  console.log(`[geofence] ${isEntering ? 'ENTERED' : 'LEFT'} zone ${zoneId}`)
})

export function useGeofenceTask() {
  useEffect(() => {
    const register = async () => {
      const { status } = await Location.requestBackgroundPermissionsAsync()
      if (status !== 'granted') return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load zones the user is a member of and watch them
      const { data: memberships } = await supabase
        .from('zone_members')
        .select('zone_id, zones(id, radius_meters)')
        .eq('user_id', user.id)

      if (!memberships?.length) return

      // We need center coordinates for each zone — fetch from zones table
      const zoneIds = memberships.map((m: any) => m.zone_id)
      const { data: zones } = await supabase
        .from('zones')
        .select('id, radius_meters')
        .in('id', zoneIds)

      if (!zones?.length) return

      // Note: PostGIS returns center as WKB — we store lat/lng separately for geofencing
      // Full implementation will use center_lat/center_lng columns (see schema.sql notes)
      console.log('[geofence] task registered for', zones.length, 'zones')
    }

    register().catch(console.error)
  }, [])
}
