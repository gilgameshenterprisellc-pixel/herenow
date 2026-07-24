import { Platform } from 'react-native'
import { supabase } from './supabase'
import { sendPushToUser } from './push'

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, any>
  is_read: boolean
  created_at: string
}

export async function fetchNotifications(): Promise<Notification[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[notifications] fetch error:', error.message)
    return []
  }

  return data ?? []
}

export async function markAllRead(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
}

export async function markOneRead(notificationId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
}

export async function getUnreadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  return count ?? 0
}

async function getUserNotifPrefs(userId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .maybeSingle()
  return (data?.notification_prefs as Record<string, boolean>) ?? {}
}

// Schedules a local device notification 6 hours before a DM window expires.
// Only fires if the user has dm_expiry pref enabled (default: true).
// Gated to native only — web has no local notification API.
export async function scheduleDmExpiryAlert(partnerName: string, expiresAt: string): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const Notifications = await import('expo-notifications')
    const secondsUntilAlert = Math.floor(
      (new Date(expiresAt).getTime() - 6 * 60 * 60 * 1000 - Date.now()) / 1000
    )
    if (secondsUntilAlert <= 0) return
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'DM window closing soon ⏰',
        body:  `Your connection with ${partnerName} expires in 6 hours. Message them before it closes!`,
        data:  { type: 'dm_expiry' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilAlert,
        repeats: false,
      } as any,
    })
  } catch (e) {
    console.warn('[notifications] scheduleDmExpiryAlert error:', e)
  }
}

const MORNING_RECAP_ID = 'morning_recap'

// Schedules a single on-device notification for the morning after a night out,
// nudging the user to open their Afterglow recap ("Your Nights"). Fires even if
// the app is closed (native only; web has no local notification API).
// Deduped by a fixed identifier: a night with five check-outs reschedules to the
// same next-morning slot, so only one recap notification ever fires. Respects
// the afterglow_recap pref (default on). Jacob: "the system hits you with a
// notification every morning at a certain time for the recap."
export async function scheduleMorningRecapAlert(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const Notifications = await import('expo-notifications')

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const prefs = await getUserNotifPrefs(user.id)
      if (prefs['afterglow_recap'] === false) {
        await Notifications.cancelScheduledNotificationAsync(MORNING_RECAP_ID).catch(() => {})
        return
      }
    }

    // Next 9:30am local time.
    const now = new Date()
    const target = new Date(now)
    target.setHours(9, 30, 0, 0)
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
    const seconds = Math.floor((target.getTime() - now.getTime()) / 1000)
    if (seconds <= 0) return

    // Clear any pending recap first so a multi-venue night fires only once.
    await Notifications.cancelScheduledNotificationAsync(MORNING_RECAP_ID).catch(() => {})
    await Notifications.scheduleNotificationAsync({
      identifier: MORNING_RECAP_ID,
      content: {
        title: 'Your night recap is ready 🌅',
        body:  'Relive last night — where you went, who you met, the whole run.',
        data:  { type: 'afterglow_recap' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      } as any,
    })
  } catch (e) {
    console.warn('[notifications] scheduleMorningRecapAlert error:', e)
  }
}

const VENUE_RECAP_ID = 'venue_recap'

// Venue-owner counterpart to the user's morning recap. Owners never check out,
// so this is scheduled from the venue dashboard whenever the venue saw people
// that day — a single next-9:30am local nudge to open the nightly recap. Deduped
// by a fixed identifier, so every dashboard load through the night reschedules to
// the same slot and only one fires. Respects the afterglow_recap pref (default
// on). Jacob: "venues should get a little notification on that tab too when the
// new recap is available."
export async function scheduleVenueRecapAlert(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const Notifications = await import('expo-notifications')

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const prefs = await getUserNotifPrefs(user.id)
      if (prefs['afterglow_recap'] === false) {
        await Notifications.cancelScheduledNotificationAsync(VENUE_RECAP_ID).catch(() => {})
        return
      }
    }

    // Next 9:30am local time.
    const now = new Date()
    const target = new Date(now)
    target.setHours(9, 30, 0, 0)
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
    const seconds = Math.floor((target.getTime() - now.getTime()) / 1000)
    if (seconds <= 0) return

    await Notifications.cancelScheduledNotificationAsync(VENUE_RECAP_ID).catch(() => {})
    await Notifications.scheduleNotificationAsync({
      identifier: VENUE_RECAP_ID,
      content: {
        title: "Your venue's recap is ready 🌅",
        body:  'See last night at your spot — who came through, when it peaked, the vibe.',
        data:  { type: 'venue_recap' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      } as any,
    })
  } catch (e) {
    console.warn('[notifications] scheduleVenueRecapAlert error:', e)
  }
}

// Fires an immediate local notification when a session ends automatically
// because the user left the venue (background geofence exit or the foreground
// presence verifier evicting them). This is the counterpart to the check-in
// haptic — a clear "you've been checked out" signal the user gets without having
// to reopen and refresh the app (Jacob's beta-night feedback). Native only;
// web has no local notification API. Manual check-out stays silent — the user
// already knows they left.
export async function notifyAutoCheckout(zoneName: string | null, sessionId?: string): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const Notifications = await import('expo-notifications')
    const where = zoneName ?? 'the venue'
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Checked out',
        body:  `You left ${where}, so we checked you out. Tap to see your recap.`,
        data:  { type: 'auto_checkout', ...(sessionId ? { session_id: sessionId } : {}) },
      },
      trigger: null, // fire immediately
    })
  } catch (e) {
    console.warn('[notifications] notifyAutoCheckout error:', e)
  }
}

// Unified helper: always inserts in-app row; fires push only if user has that type enabled
export async function sendNotification(params: {
  userId: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
}): Promise<void> {
  await supabase.from('notifications').insert({
    user_id: params.userId,
    type:    params.type,
    title:   params.title,
    body:    params.body,
    data:    params.data ?? {},
  })

  // Default all types to enabled; user can opt out in Settings → Notifications
  const prefs = await getUserNotifPrefs(params.userId)
  const pushEnabled = prefs[params.type] !== false
  if (pushEnabled) {
    sendPushToUser(params.userId, params.title, params.body, params.data).catch(() => {})
  }
}
