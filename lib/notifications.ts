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
