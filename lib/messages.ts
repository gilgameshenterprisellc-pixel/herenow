import { supabase } from './supabase'
import { sendNotification } from './notifications'

export interface DirectMessage {
  id: string
  we_met_id: string
  sender_id: string
  recipient_id: string
  content: string
  sent_at: string
  expires_at: string
  read_at: string | null
}

export interface DmThread {
  we_met_id: string
  other_user_id: string
  other_display_name: string
  other_avatar_url: string | null
  last_content: string | null
  last_message_at: string | null
  last_sender_id: string | null
  unread_count: number
  expires_at: string
  zone_name: string | null
}

export async function fetchMessages(wemetId: string): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('we_met_id', wemetId)
    .order('sent_at', { ascending: true })

  if (error) {
    console.error('[messages] fetchMessages error:', error.message)
    return []
  }

  return data ?? []
}

export async function sendMessage(params: {
  wemetId: string
  content: string
  recipientId?: string
}): Promise<DirectMessage | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  let recipientId = params.recipientId
  if (!recipientId) {
    const { data: wm } = await supabase
      .from('we_met')
      .select('initiator_id, recipient_id')
      .eq('id', params.wemetId)
      .single()
    if (!wm) return null
    recipientId = wm.initiator_id === user.id ? wm.recipient_id : wm.initiator_id
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      we_met_id:    params.wemetId,
      sender_id:    user.id,
      recipient_id: recipientId,
      content:      params.content.trim(),
    })
    .select('*')
    .single()

  if (error) {
    console.error('[messages] sendMessage error:', error.message)
    return null
  }

  await sendNotification({
    userId: recipientId,
    type:   'message',
    title:  '💌 New message',
    body:   params.content.slice(0, 80),
    data:   { we_met_id: params.wemetId },
  })

  return data
}

export async function markMessagesRead(wemetId: string, userId?: string): Promise<void> {
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id
  if (!uid) return

  await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('we_met_id', wemetId)
    .eq('recipient_id', uid)
    .is('read_at', null)
}

export async function fetchDmThreads(): Promise<DmThread[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: wemets, error } = await supabase
    .from('we_met')
    .select(`
      id, expires_at, zone_id,
      initiator_id, recipient_id,
      initiator_profile:profiles!we_met_initiator_id_fkey(id, display_name, avatar_url),
      recipient_profile:profiles!we_met_recipient_id_fkey(id, display_name, avatar_url),
      zone:zones(name)
    `)
    .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .eq('status', 'confirmed')

  if (error || !wemets) return []

  const threads: DmThread[] = await Promise.all(
    wemets.map(async (wm: any) => {
      const isInitiator = wm.initiator_id === user.id
      const other    = isInitiator ? wm.recipient_profile : wm.initiator_profile
      const otherId  = isInitiator ? wm.recipient_id : wm.initiator_id

      const { data: msgs } = await supabase
        .from('direct_messages')
        .select('content, sent_at, sender_id')
        .eq('we_met_id', wm.id)
        .order('sent_at', { ascending: false })
        .limit(1)

      const last = msgs?.[0] ?? null

      const { count: unread } = await supabase
        .from('direct_messages')
        .select('*', { count: 'exact', head: true })
        .eq('we_met_id', wm.id)
        .eq('recipient_id', user.id)
        .is('read_at', null)

      return {
        we_met_id:          wm.id,
        other_user_id:      otherId,
        other_display_name: other?.display_name ?? 'Unknown',
        other_avatar_url:   other?.avatar_url ?? null,
        last_content:       last?.content ?? null,
        last_message_at:    last?.sent_at ?? null,
        last_sender_id:     last?.sender_id ?? null,
        unread_count:       unread ?? 0,
        expires_at:         wm.expires_at,
        zone_name:          wm.zone?.name ?? null,
      }
    })
  )

  return threads.sort((a, b) =>
    (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
  )
}
