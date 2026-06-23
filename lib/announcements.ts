import { supabase } from './supabase'

export interface Announcement {
  id: string
  zone_id: string
  created_by: string | null
  message: string
  expires_at: string
  created_at: string
}

/** Active (non-expired) announcements for a zone, newest first */
export async function fetchAnnouncements(zoneId: string): Promise<Announcement[]> {
  const { data } = await supabase
    .from('venue_announcements')
    .select('*')
    .eq('zone_id', zoneId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function sendAnnouncement(params: {
  zoneId: string
  message: string
  expiresInHours?: number
}): Promise<Announcement | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + (params.expiresInHours ?? 2))

  const { data } = await supabase
    .from('venue_announcements')
    .insert({
      zone_id:    params.zoneId,
      created_by: user.id,
      message:    params.message,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  return data
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await supabase.from('venue_announcements').delete().eq('id', id)
}
