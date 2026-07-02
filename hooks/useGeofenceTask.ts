import { useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import { checkOut } from '@/lib/sessions'

export const GEOFENCE_TASK = 'HERENOW_GEOFENCE_TASK'

// Native-only: register the background geofence task handler
if (Platform.OS !== 'web') {
  const TaskManager = require('expo-task-manager')
  const Location = require('expo-location')

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

    if (isEntering) {
      await supabase
        .from('zone_members')
        .update({ is_present: true, last_seen_at: new Date().toISOString() })
        .eq('zone_id', zoneId)
        .eq('user_id', user.id)
    } else {
      // User left the venue — auto-checkout active session
      const { data: session } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('zone_id', zoneId)
        .eq('is_active', true)
        .maybeSingle()

      if (session) {
        await checkOut(session.id).catch((e: unknown) =>
          console.error('[geofence] auto-checkout error:', e)
        )
      } else {
        // No active session — just clear presence
        await supabase
          .from('zone_members')
          .update({ is_present: false, last_seen_at: new Date().toISOString() })
          .eq('zone_id', zoneId)
          .eq('user_id', user.id)
      }
    }
  })
}

export function useGeofenceTask() {
  useEffect(() => {
    if (Platform.OS === 'web') return

    const Location = require('expo-location')

    const register = async () => {
      const { status } = await Location.requestBackgroundPermissionsAsync()
      if (status !== 'granted') return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberships } = await supabase
        .from('zone_members')
        .select('zone_id')
        .eq('user_id', user.id)

      if (!memberships?.length) return

      const zoneIds = memberships.map((m: any) => m.zone_id)
      const { data: zones } = await supabase
        .from('zones')
        .select('id, center_lat, center_lng, radius_meters')
        .in('id', zoneIds)

      if (!zones?.length) return

      const regions = zones.map((z: any) => ({
        identifier: z.id,
        latitude:   z.center_lat,
        longitude:  z.center_lng,
        // Use at least 150m for background wake-up so the OS fires the event
        // before the user reaches the door. The precise polygon check happens
        // when the user taps Check In — via user_in_zone() in the DB.
        radius: Math.max(z.radius_meters ?? 10, 150),
      }))

      await Location.startGeofencingAsync(GEOFENCE_TASK, regions)
    }

    register().catch(console.error)
  }, [])
}
