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
  expires_at: string | null  // window deadline; '2099-12-31...' sentinel = permanent (mutual-reply)
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

// First 48 rules (Jacob, July 7 2026):
// - DMs open at mutual We Met confirmation with a 48h first-move window
// - The first message resets the window: the other person has 48h to reply
// - A reply from the other party makes the thread permanent (sentinel date)
export const DM_PERMANENT_SENTINEL = '2099-12-31T00:00:00Z'

export function isPermanentDm(expiresAt: string | null): boolean {
  return !!expiresAt && new Date(expiresAt).getFullYear() >= 2099
}

export async function sendMessage(params: {
  wemetId: string
  content: string
  recipientId?: string
}): Promise<DirectMessage | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: wm } = await supabase
    .from('we_met')
    .select('initiator_id, recipient_id, expires_at')
    .eq('id', params.wemetId)
    .maybeSingle()
  if (!wm) return null

  const recipientId = params.recipientId
    ?? (wm.initiator_id === user.id ? wm.recipient_id : wm.initiator_id)

  const permanent = isPermanentDm(wm.expires_at)
  const windowDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      we_met_id:    params.wemetId,
      sender_id:    user.id,
      recipient_id: recipientId,
      content:      params.content.trim(),
      // Message rows carry their own RLS expiry — align with the thread state so
      // messages in permanent threads never vanish out from under the conversation.
      expires_at:   permanent ? DM_PERMANENT_SENTINEL : windowDeadline,
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
    title:  'New message',
    body:   params.content.slice(0, 80),
    data:   { we_met_id: params.wemetId },
  })

  if (!permanent) {
    const { count: partnerMsgCount } = await supabase
      .from('direct_messages')
      .select('id', { count: 'exact', head: true })
      .eq('we_met_id', params.wemetId)
      .eq('sender_id', recipientId)

    if ((partnerMsgCount ?? 0) > 0) {
      // Reciprocated — thread goes permanent. The RPC also backfills the partner's
      // message rows past their 72h RLS expiry; falls back to a direct we_met update
      // if the SQL hasn't been run yet (.rpc returns errors, it doesn't throw).
      const { error: rpcError } = await supabase.rpc('make_thread_permanent', {
        p_we_met_id: params.wemetId,
      })
      if (rpcError) {
        await supabase
          .from('we_met')
          .update({ expires_at: DM_PERMANENT_SENTINEL })
          .eq('id', params.wemetId)
      }
    } else {
      const { count: totalCount } = await supabase
        .from('direct_messages')
        .select('id', { count: 'exact', head: true })
        .eq('we_met_id', params.wemetId)

      // Only the actual first move starts the 48h reply window — later unanswered
      // nudges don't extend it, or a sender could keep a dead thread alive forever.
      if ((totalCount ?? 0) === 1) {
        await supabase
          .from('we_met')
          .update({ expires_at: windowDeadline })
          .eq('id', params.wemetId)
      }
    }
  }

  return data
}

export async function getDmUnreadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { count } = await supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null)
  return count ?? 0
}

export async function markMessagesRead(wemetId: string, userId?: string): Promise<void> {
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id
  if (!uid) return

  const { error } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('we_met_id', wemetId)
    .eq('recipient_id', uid)
    .is('read_at', null)

  if (error) console.error('[messages] markMessagesRead error:', error.message)
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
