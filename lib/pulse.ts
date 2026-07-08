import { supabase } from './supabase'
import { logEvent } from './analytics'

export interface PulsePost {
  id: string
  zone_id: string
  session_id: string
  user_id: string
  content: string | null
  media_url: string | null
  vibe_tag: string | null
  is_pinned: boolean
  is_venue_post: boolean
  expires_at: string
  created_at: string
  profiles: {
    id: string
    display_name: string
    avatar_url: string | null
  } | null
}

export const VIBE_TAGS = [
  '🔥 Lit',
  '😊 Good vibes',
  '🎵 Music slaps',
  '🍺 Drinks flowing',
  '💃 Dancing',
  '😴 Chill',
  '👀 Something wild',
  '🎉 Party mode',
]

export async function fetchPulse(zoneId: string): Promise<PulsePost[]> {
  const { data, error } = await supabase
    .from('pulse_posts')
    .select('*, profiles(id, display_name, avatar_url)')
    .eq('zone_id', zoneId)
    .eq('is_hidden', false)
    .gt('expires_at', new Date().toISOString())
    // Pinned venue posts first, then newest
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error('[pulse] fetchPulse error:', error.message)
    return []
  }

  return (data as PulsePost[]) ?? []
}

export async function createPulsePost(params: {
  zoneId: string
  sessionId: string
  content?: string
  vibeTag?: string
  mediaUrl?: string | null
  isVenuePost?: boolean
}): Promise<PulsePost | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('pulse_posts')
    .insert({
      zone_id: params.zoneId,
      session_id: params.sessionId,
      user_id: user.id,
      content: params.content ?? null,
      vibe_tag: params.vibeTag ?? null,
      media_url: params.mediaUrl ?? null,
      is_venue_post: params.isVenuePost ?? false,
    })
    .select('*, profiles(id, display_name, avatar_url)')
    .single()

  if (error) {
    console.error('[pulse] createPulsePost error:', error.message)
    return null
  }

  logEvent('pulse_posted', { zoneId: params.zoneId })
  return data as PulsePost
}

// Venue owners can pin one of their own Pulse posts to the top.
export async function togglePinPulse(postId: string, pinned: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('pulse_posts')
    .update({ is_pinned: pinned })
    .eq('id', postId)
  return !error
}

export async function deletePulsePost(postId: string): Promise<void> {
  await supabase.from('pulse_posts').delete().eq('id', postId)
}
