import { useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import { checkOut, verifyZonePresence } from '@/lib/sessions'
import { shouldBackgroundCheckout } from '@/lib/presence'
import { notifyAutoCheckout } from '@/lib/notifications'

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
      // OS says the user left the ~150m region. These background Exit events are
      // noisy indoors (wifi/cell fallback, multipath) and were ending sessions
      // while people were still at the venue. Re-verify against the real
      // polygon/radius with a fresh, accuracy-gated fix before checking out.
      // Anything other than a confirmed "outside" (still inside, or no fix we
      // trust) leaves the session alone — the foreground verifier and the 30-min
      // server staleness net will catch a genuine departure.
      const presence = await verifyZonePresence(zoneId).catch(() => 'unknown' as const)
      if (!shouldBackgroundCheckout(presence)) return

      // Confirmed out of the venue — auto-checkout active session
      const { data: session } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('zone_id', zoneId)
        .eq('is_active', true)
        .maybeSingle()

      if (session) {
        const zoneName = await checkOut(session.id).catch((e: unknown) => {
          console.error('[geofence] auto-checkout error:', e)
          return null
        })
        // Tell the user they were dropped for leaving — the whole point of the
        // proximity checkout is that it happens while the app is closed. Only
        // notify if checkOut actually ended the session (non-null name); a null
        // means it errored or was already closed, so there's nothing to announce.
        if (zoneName) await notifyAutoCheckout(zoneName, session.id)
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

// Build the OS exit-ring set from the user's current zone memberships and
// (re)start background monitoring. startGeofencingAsync REPLACES the prior set
// for this task, so calling it again is exactly how we re-sync after a new
// check-in. Assumes background-location permission is already granted — callers
// gate that. iOS monitors at most 20 regions; the pilot is well under that.
async function startGeofencingForMemberZones(): Promise<void> {
  const Location = require('expo-location')

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

// Re-sync background geofence monitoring to the user's CURRENT venues. Call this
// after every successful check-in so the venue just joined gets its exit ring
// registered immediately. Without it, a first-ever check-in at a venue (a
// brand-new pilot user, e.g. someone testing at Martha for the first time) had
// no background exit ring until the next app restart — so closing the app and
// walking away never auto-checked them out. Never prompts: if background
// permission isn't granted yet it no-ops (the mount-time hook does the asking).
// Fire-and-forget; failures are logged, never thrown.
export async function refreshGeofences(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const Location = require('expo-location')
    const { status } = await Location.getBackgroundPermissionsAsync()
    if (status !== 'granted') return
    await startGeofencingForMemberZones()
  } catch (e) {
    console.error('[geofence] refreshGeofences failed:', e)
  }
}

export function useGeofenceTask() {
  useEffect(() => {
    if (Platform.OS === 'web') return

    const register = async () => {
      const Location = require('expo-location')
      const { status } = await Location.requestBackgroundPermissionsAsync()
      if (status !== 'granted') return
      await startGeofencingForMemberZones()
    }

    register().catch(console.error)
  }, [])
}
