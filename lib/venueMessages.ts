import { supabase } from './supabase'
import { sendNotification } from './notifications'
import { DM_PERMANENT_SENTINEL, type DirectMessage } from './messages'

// Venue DMs (Jacob build 8): a follower/subscriber can message a venue with no
// We Met and no expiry. Separate thread type from We Met DMs. A thread is keyed
// on (venue_zone_id, the other party). Requires supabase/jacob_venue_dms.sql.

export interface VenueThread {
  zone_id: string
  zone_name: string
  // The other party in this thread. For a normal user that's the venue owner;
  // for the venue owner that's the patron who messaged them.
  other_user_id: string
  other_display_name: string
  other_avatar_url: string | null
  // True when the current user owns this venue (they're reading a patron thread).
  viewer_is_owner: boolean
  last_content: string | null
  last_message_at: string | null
  last_sender_id: string | null
  unread_count: number
}

// Send a message in a venue thread. When the sender is a patron, recipient
// defaults to the venue owner. When the venue owner replies, pass the patron's id.
export async function sendVenueMessage(params: {
  zoneId: string
  content: string
  recipientId?: string
}): Promise<DirectMessage | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: zone } = await supabase
    .from('zones').select('owner_id, name').eq('id', params.zoneId).maybeSingle()
  if (!zone) return null

  const isOwner = zone.owner_id === user.id
  const recipientId = params.recipientId ?? (isOwner ? null : zone.owner_id)
  if (!recipientId) return null // owner must specify who they're replying to

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      we_met_id:     null,
      venue_zone_id: params.zoneId,
      sender_id:     user.id,
      recipient_id:  recipientId,
      content:       params.content.trim(),
      expires_at:    DM_PERMANENT_SENTINEL, // venue DMs never expire
    })
    .select('*')
    .single()

  if (error) {
    console.error('[venueMessages] send error:', error.message)
    return null
  }

  await sendNotification({
    userId: recipientId,
    type:   'message',
    title:  isOwner ? `💬 ${zone.name}` : '💬 New message',
    body:   params.content.slice(0, 80),
    data:   { venue_zone_id: params.zoneId, from_user_id: user.id },
  })

  return data as DirectMessage
}

// All messages between the current user and `otherUserId` in this venue thread.
export async function fetchVenueThreadMessages(zoneId: string, otherUserId: string): Promise<DirectMessage[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('venue_zone_id', zoneId)
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
    .order('sent_at', { ascending: true })

  if (error) {
    console.error('[venueMessages] fetchThread error:', error.message)
    return []
  }
  return (data ?? []) as DirectMessage[]
}

export async function markVenueThreadRead(zoneId: string, otherUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('venue_zone_id', zoneId)
    .eq('sender_id', otherUserId)
    .eq('recipient_id', user.id)
    .is('read_at', null)
}

// Unified venue-thread list for the current user (works for both patrons and
// venue owners — grouped by (zone, other party) so an owner sees one row per
// patron and a patron sees one row per venue).
export async function fetchVenueThreads(): Promise<VenueThread[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: msgs, error } = await supabase
    .from('direct_messages')
    .select('venue_zone_id, sender_id, recipient_id, content, sent_at, read_at')
    .not('venue_zone_id', 'is', null)
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('sent_at', { ascending: false })

  if (error || !msgs || msgs.length === 0) return []

  // Group by (zone, the other party).
  const groups = new Map<string, { zoneId: string; otherId: string; msgs: typeof msgs }>()
  for (const m of msgs as any[]) {
    const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id
    const key = `${m.venue_zone_id}:${otherId}`
    if (!groups.has(key)) groups.set(key, { zoneId: m.venue_zone_id, otherId, msgs: [] })
    groups.get(key)!.msgs.push(m)
  }

  const zoneIds = Array.from(new Set(Array.from(groups.values()).map((g) => g.zoneId)))
  const otherIds = Array.from(new Set(Array.from(groups.values()).map((g) => g.otherId)))

  const [{ data: zones }, { data: profiles }] = await Promise.all([
    supabase.from('zones').select('id, name, owner_id').in('id', zoneIds),
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', otherIds),
  ])
  const zoneMap = new Map((zones ?? []).map((z: any) => [z.id, z]))
  const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const threads: VenueThread[] = Array.from(groups.values()).map((g) => {
    const zone = zoneMap.get(g.zoneId)
    const other = profMap.get(g.otherId)
    const viewerIsOwner = zone?.owner_id === user.id
    const last = g.msgs[0] // already sorted desc
    const unread = g.msgs.filter((m: any) => m.recipient_id === user.id && !m.read_at).length
    return {
      zone_id:            g.zoneId,
      zone_name:          zone?.name ?? 'Venue',
      other_user_id:      g.otherId,
      // A patron's row shows the venue name; an owner's row shows the patron.
      other_display_name: viewerIsOwner ? (other?.display_name ?? 'Guest') : (zone?.name ?? 'Venue'),
      other_avatar_url:   viewerIsOwner ? (other?.avatar_url ?? null) : null,
      viewer_is_owner:    viewerIsOwner,
      last_content:       last?.content ?? null,
      last_message_at:    last?.sent_at ?? null,
      last_sender_id:     last?.sender_id ?? null,
      unread_count:       unread,
    }
  })

  return threads.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
}
