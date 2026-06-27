import { supabase } from './supabase'
import { sendNotification } from './notifications'

export interface WeMet {
  id: string
  zone_id: string
  initiator_id: string
  recipient_id: string
  initiator_session_id: string | null
  recipient_session_id: string | null
  status: 'pending' | 'confirmed' | 'declined' | 'expired'
  initiated_at: string
  confirmed_at: string | null
  expires_at: string | null  // NULL = confirmed but DMs locked until checkout
  initiator_profile?: {
    id: string
    display_name: string
    avatar_url: string | null
    social_mode: string | null
    mood_mode: string | null
  }
  recipient_profile?: {
    id: string
    display_name: string
    avatar_url: string | null
    social_mode: string | null
    mood_mode: string | null
  }
}

export async function sendWeMet(params: {
  zoneId: string
  recipientId: string
  initiatorSessionId?: string | null
  recipientSessionId?: string | null
}): Promise<WeMet | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Hard boundary: never create a We Met request for a Not Today user.
  // Use maybeSingle — if recipientId is invalid, single() would throw PGRST116.
  const { data: recipientProfile } = await supabase
    .from('profiles')
    .select('mood_mode')
    .eq('id', params.recipientId)
    .maybeSingle()

  // If recipient doesn't exist or is in not_today mode, block silently
  if (!recipientProfile || recipientProfile.mood_mode === 'not_today') return null

  const { data, error } = await supabase
    .from('we_met')
    .insert({
      zone_id: params.zoneId,
      initiator_id: user.id,
      recipient_id: params.recipientId,
      initiator_session_id: params.initiatorSessionId ?? null,
      recipient_session_id: params.recipientSessionId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[we_met] sendWeMet error:', error.message)
    return null
  }

  // Notify recipient (in-app + push)
  await sendNotification({
    userId: params.recipientId,
    type:   'we_met_request',
    title:  'Someone wants to confirm you met! 🤝',
    body:   'Tap to confirm or decline.',
    data:   { we_met_id: data.id },
  })

  return data
}

export async function confirmWeMet(wemetId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: record } = await supabase
    .from('we_met')
    .select('initiator_id')
    .eq('id', wemetId)
    .maybeSingle()

  // Leave expires_at as NULL — DM window opens when the user checks out of the venue
  await supabase
    .from('we_met')
    .update({
      status:       'confirmed',
      confirmed_at: new Date().toISOString(),
      expires_at:   null,
    })
    .eq('id', wemetId)
    .eq('recipient_id', user.id)

  if (record) {
    await sendNotification({
      userId: record.initiator_id,
      type:   'we_met_confirmed',
      title:  'We Met confirmed! 🤝',
      body:   'DMs unlock when you both leave the venue. You\'ll have 72 hours.',
      data:   { we_met_id: wemetId },
    })
  }
}

// Called on checkout — opens the 72-hour DM window for all confirmed We Mets from this session
export async function unlockWeMetsOnCheckout(sessionId: string): Promise<void> {
  const dmWindowExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('we_met')
    .update({ expires_at: dmWindowExpiry })
    .eq('status', 'confirmed')
    .or(`initiator_session_id.eq.${sessionId},recipient_session_id.eq.${sessionId}`)
    .is('expires_at', null)
}

export async function declineWeMet(wemetId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('we_met')
    .update({ status: 'declined' })
    .eq('id', wemetId)
    .eq('recipient_id', user.id)
}

export async function fetchMyWeMets(): Promise<WeMet[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('we_met')
    .select(`
      *,
      initiator_profile:profiles!we_met_initiator_id_fkey(id, display_name, avatar_url, social_mode, mood_mode),
      recipient_profile:profiles!we_met_recipient_id_fkey(id, display_name, avatar_url, social_mode, mood_mode)
    `)
    .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('initiated_at', { ascending: false })

  if (error) {
    console.error('[we_met] fetchMyWeMets error:', error.message)
    return []
  }

  return (data as WeMet[]) ?? []
}

export async function fetchPendingWeMets(): Promise<WeMet[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('we_met')
    .select(`
      *,
      initiator_profile:profiles!we_met_initiator_id_fkey(id, display_name, avatar_url, social_mode, mood_mode)
    `)
    .eq('recipient_id', user.id)
    .eq('status', 'pending')
    .order('initiated_at', { ascending: false })

  if (error) {
    console.error('[we_met] fetchPendingWeMets error:', error.message)
    return []
  }

  return (data as WeMet[]) ?? []
}

export async function fetchConfirmedWeMets(): Promise<WeMet[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('we_met')
    .select(`
      *,
      initiator_profile:profiles!we_met_initiator_id_fkey(id, display_name, avatar_url, social_mode, mood_mode),
      recipient_profile:profiles!we_met_recipient_id_fkey(id, display_name, avatar_url, social_mode, mood_mode)
    `)
    .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false })

  if (error) {
    console.error('[we_met] fetchConfirmedWeMets error:', error.message)
    return []
  }

  return (data as WeMet[]) ?? []
}

export async function existingWeMet(params: {
  zoneId: string
  otherUserId: string
}): Promise<WeMet | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('we_met')
    .select('*')
    .eq('zone_id', params.zoneId)
    .or(
      `and(initiator_id.eq.${user.id},recipient_id.eq.${params.otherUserId}),` +
      `and(initiator_id.eq.${params.otherUserId},recipient_id.eq.${user.id})`
    )
    .maybeSingle()

  return data
}
