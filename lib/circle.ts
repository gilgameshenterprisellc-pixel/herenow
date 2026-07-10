import { supabase } from './supabase'
import { sendNotification } from './notifications'
import { publicName } from './format'

// My Circle — a deliberate, mutual, private list of people you've chosen to keep.
// A confirmed We Met is required to send a request (enforced in RLS too).

export type CircleStatus = 'none' | 'pending_out' | 'pending_in' | 'in_circle'

export interface CircleMember {
  request_id: string
  user_id: string
  display_name: string
  avatar_url: string | null
}

export interface IncomingCircleRequest {
  request_id: string
  requester_id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

// Where the current user stands with another user.
export async function getCircleStatus(otherId: string): Promise<{ status: CircleStatus; requestId: string | null }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'none', requestId: null }

  const { data } = await supabase
    .from('circle_requests')
    .select('id, requester_id, recipient_id, status')
    .or(`and(requester_id.eq.${user.id},recipient_id.eq.${otherId}),and(requester_id.eq.${otherId},recipient_id.eq.${user.id})`)
    .maybeSingle()

  if (!data) return { status: 'none', requestId: null }
  if (data.status === 'accepted') return { status: 'in_circle', requestId: data.id }
  if (data.status === 'pending') {
    return data.requester_id === user.id
      ? { status: 'pending_out', requestId: data.id }
      : { status: 'pending_in', requestId: data.id }
  }
  // declined → treat as none so they can try again later
  return { status: 'none', requestId: data.id }
}

export async function sendCircleRequest(recipientId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // If a prior declined row exists, revive it as a fresh pending request.
  const { error } = await supabase
    .from('circle_requests')
    .upsert(
      { requester_id: user.id, recipient_id: recipientId, status: 'pending', responded_at: null },
      { onConflict: 'requester_id,recipient_id' }
    )
  if (error) {
    console.error('[circle] sendCircleRequest error:', error.message)
    return false
  }

  await sendNotification({
    userId: recipientId,
    type:   'circle_request',
    title:  'Someone wants you in their Circle 🔵',
    body:   'Tap to see who and add them back.',
    data:   { route: 'circle' },
  })
  return true
}

export async function respondCircleRequest(requestId: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase
    .from('circle_requests')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('requester_id')
    .maybeSingle()
  if (error) {
    console.error('[circle] respondCircleRequest error:', error.message)
    return false
  }
  if (accept && data) {
    await sendNotification({
      userId: data.requester_id,
      type:   'circle_accepted',
      title:  'You\'re in their Circle 🔵',
      body:   'You\'re now connected.',
      data:   {},
    })
  }
  return true
}

export async function removeFromCircle(requestId: string): Promise<boolean> {
  const { error } = await supabase.from('circle_requests').delete().eq('id', requestId)
  return !error
}

// Accepted connections in either direction → the other person's profile.
export async function fetchMyCircle(): Promise<CircleMember[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('circle_requests')
    .select(`
      id, requester_id, recipient_id,
      requester:profiles!circle_requests_requester_id_fkey(id, display_name, avatar_url),
      recipient:profiles!circle_requests_recipient_id_fkey(id, display_name, avatar_url)
    `)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)

  return ((data ?? []) as any[]).map((r) => {
    const other = r.requester_id === user.id ? r.recipient : r.requester
    return {
      request_id:   r.id,
      user_id:      other?.id ?? '',
      display_name: publicName(other?.display_name),
      avatar_url:   other?.avatar_url ?? null,
    }
  })
}

export async function fetchIncomingCircleRequests(): Promise<IncomingCircleRequest[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('circle_requests')
    .select('id, requester_id, created_at, requester:profiles!circle_requests_requester_id_fkey(id, display_name, avatar_url)')
    .eq('recipient_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return ((data ?? []) as any[]).map((r) => ({
    request_id:   r.id,
    requester_id: r.requester_id,
    display_name: publicName(r.requester?.display_name),
    avatar_url:   r.requester?.avatar_url ?? null,
    created_at:   r.created_at,
  }))
}
