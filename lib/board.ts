import { supabase } from './supabase'
import { logEvent } from './analytics'
import { sendNotification } from './notifications'
import { screenText } from './textModeration'
import { publicName } from './format'

// ═══════════════════════════════════════════════════════════════════════════
// THE BOARD — a digital bulletin board per venue (Jacob's proposal, July 2026).
//
// Access (view AND post) = currently checked in + subscribed. The Board belongs
// to the venue's actual community, not to people browsing from home. Venue
// owners always see their own Board for moderation.
//
// Responses are intentionally NOT DMs: a Respond creates a temporary thread
// tied to one pin, which expires with inactivity or when the pin closes. It
// never creates a social connection — the We Met system stays the only door
// to real DMs.
// ═══════════════════════════════════════════════════════════════════════════

export type BoardCategoryId =
  | 'poetry' | 'thoughts' | 'humor' | 'missed_connections' | 'community' | 'flyers' | 'art'
  | 'for_sale' | 'tickets' | 'housing' | 'looking_for' | 'jobs' | 'collab' | 'lost_found'

export interface BoardCategory {
  id: BoardCategoryId
  label: string
  color: string
  // Respondable categories show a Respond button (someone would naturally need
  // to contact the poster). Read-only categories take Like/Save/Report only.
  respondable: boolean
}

export const BOARD_CATEGORIES: BoardCategory[] = [
  // Read-only — meant to be read, not discussed
  { id: 'poetry',             label: 'Poetry',              color: '#a855f7', respondable: false },
  { id: 'thoughts',           label: 'Thoughts',            color: '#29B6F6', respondable: false },
  { id: 'humor',              label: 'Humor',               color: '#f59e0b', respondable: false },
  { id: 'missed_connections', label: 'Missed Connections',  color: '#f43f5e', respondable: false },
  { id: 'community',          label: 'Community',           color: '#22c55e', respondable: false },
  { id: 'flyers',             label: 'Flyers & Events',     color: '#8b5cf6', respondable: false },
  { id: 'art',                label: 'Art & Photos',        color: '#ec4899', respondable: false },
  // Respondable — someone needs to reach the poster
  { id: 'for_sale',           label: 'For Sale',            color: '#10b981', respondable: true },
  { id: 'tickets',            label: 'Tickets',             color: '#06b6d4', respondable: true },
  { id: 'housing',            label: 'Housing & Roommates', color: '#f97316', respondable: true },
  { id: 'looking_for',        label: 'Looking For…',        color: '#eab308', respondable: true },
  { id: 'jobs',               label: 'Jobs & Gigs',         color: '#3b82f6', respondable: true },
  { id: 'collab',             label: 'Creative Collab',     color: '#d946ef', respondable: true },
  { id: 'lost_found',         label: 'Lost & Found',        color: '#ef4444', respondable: true },
]

export function boardCategory(id: string): BoardCategory {
  return BOARD_CATEGORIES.find((c) => c.id === id)
    ?? { id: 'thoughts', label: id, color: '#29B6F6', respondable: false }
}

export interface BoardPin {
  id: string
  zone_id: string
  category: BoardCategoryId
  title: string
  body: string
  image_url: string | null
  is_anonymous: boolean
  status: 'active' | 'complete' | 'hidden' | 'removed'
  responses_closed: boolean
  is_pinned: boolean
  created_at: string
  author_id: string | null   // null = anonymous (not you)
  author_name: string | null // null = anonymous (not you)
  is_own: boolean
  like_count: number
  save_count: number
  liked: boolean
  saved: boolean
  response_count: number
  my_response_id: string | null
}

export type BoardAccess = 'ok' | 'not_checked_in' | 'not_subscribed'

// The gate, spelled out for the UI: both conditions checked separately so the
// screen can say exactly what's missing. Venue owners always pass.
export async function checkBoardAccess(zoneId: string): Promise<BoardAccess> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'not_checked_in'

  const { data: zone } = await supabase
    .from('zones').select('owner_id').eq('id', zoneId).maybeSingle()
  if (zone?.owner_id === user.id) return 'ok'

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('zone_id', zoneId)
    .eq('is_active', true)
    .maybeSingle()
  if (!session) return 'not_checked_in'

  const { data: sub } = await supabase
    .from('venue_subscriptions')
    .select('is_subscriber')
    .eq('user_id', user.id)
    .eq('zone_id', zoneId)
    .maybeSingle()
  if (!sub?.is_subscriber) return 'not_subscribed'

  return 'ok'
}

export async function fetchBoard(zoneId: string): Promise<BoardPin[]> {
  const { data, error } = await supabase.rpc('board_pins_for_zone', { zone_uuid: zoneId })
  if (error) {
    console.error('[board] fetchBoard error:', error.message)
    return []
  }
  // Public-facing names are first name + last initial, same as everywhere else.
  return ((data ?? []) as BoardPin[]).map((p) => ({
    ...p,
    author_name: p.author_name ? publicName(p.author_name) : null,
  }))
}

export async function createPin(params: {
  zoneId: string
  category: BoardCategoryId
  title: string
  body: string
  imageUrl?: string | null
  isAnonymous: boolean
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'Not signed in.' }

  // Same word-list screen as chat/pulse — instant posting still gets the filter.
  const titleScreen = screenText(params.title)
  const bodyScreen = screenText(params.body)
  if (!titleScreen.ok || !bodyScreen.ok) {
    return { ok: false, reason: 'That wording can\'t go on the Board — tone it down and try again.' }
  }

  const { error } = await supabase.from('board_pins').insert({
    zone_id: params.zoneId,
    user_id: user.id,
    category: params.category,
    title: params.title.trim(),
    body: params.body.trim(),
    image_url: params.imageUrl ?? null,
    is_anonymous: params.isAnonymous,
  })
  if (error) {
    console.error('[board] createPin error:', error.message)
    // RLS rejects when not checked in + subscribed, or banned from this Board.
    return { ok: false, reason: 'Could not pin this. You need to be checked in and subscribed — and not restricted by the venue.' }
  }
  logEvent('board_pin_created', { zoneId: params.zoneId, category: params.category, anonymous: params.isAnonymous })
  return { ok: true }
}

export async function updatePin(pinId: string, params: {
  category: BoardCategoryId
  title: string
  body: string
}): Promise<boolean> {
  const titleScreen = screenText(params.title)
  const bodyScreen = screenText(params.body)
  if (!titleScreen.ok || !bodyScreen.ok) return false

  const { error } = await supabase
    .from('board_pins')
    .update({
      category: params.category,
      title: params.title.trim(),
      body: params.body.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pinId)
  return !error
}

// Poster removes their own pin ("take it off the board").
export async function removePin(pinId: string): Promise<boolean> {
  const { error } = await supabase
    .from('board_pins')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', pinId)
  return !error
}

// Poster marks a respondable pin Complete/Sold — stays visible with a badge.
export async function markPinComplete(pinId: string): Promise<boolean> {
  const { error } = await supabase
    .from('board_pins')
    .update({ status: 'complete', updated_at: new Date().toISOString() })
    .eq('id', pinId)
  return !error
}

// Poster closes responses — no additional people can respond.
export async function closePinResponses(pinId: string): Promise<boolean> {
  const { error } = await supabase
    .from('board_pins')
    .update({ responses_closed: true, updated_at: new Date().toISOString() })
    .eq('id', pinId)
  return !error
}

export async function toggleLike(pinId: string, liked: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if (liked) {
    await supabase.from('board_pin_likes').delete().eq('pin_id', pinId).eq('user_id', user.id)
  } else {
    await supabase.from('board_pin_likes').upsert(
      { pin_id: pinId, user_id: user.id },
      { onConflict: 'pin_id,user_id', ignoreDuplicates: true })
  }
}

export async function toggleSave(pinId: string, saved: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if (saved) {
    await supabase.from('board_pin_saves').delete().eq('pin_id', pinId).eq('user_id', user.id)
  } else {
    await supabase.from('board_pin_saves').upsert(
      { pin_id: pinId, user_id: user.id },
      { onConflict: 'pin_id,user_id', ignoreDuplicates: true })
  }
}

// Report — auto-hides the pin at 2 distinct reporters, pending review.
export async function reportPin(pinId: string, reason?: string): Promise<boolean> {
  const { error } = await supabase.rpc('board_report_pin', { p_pin: pinId, p_reason: reason ?? null })
  if (!error) logEvent('board_pin_reported', { pinId })
  return !error
}

// ── Venue moderation ─────────────────────────────────────────────────────────

export async function venueRemovePin(pinId: string): Promise<boolean> {
  return removePin(pinId) // same status flip; RLS lets the venue owner do it
}

export async function venueHidePin(pinId: string, hidden: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('board_pins')
    .update({ status: hidden ? 'hidden' : 'active', updated_at: new Date().toISOString() })
    .eq('id', pinId)
  return !error
}

export async function venuePinToTop(pinId: string, pinned: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('board_pins')
    .update({ is_pinned: pinned, updated_at: new Date().toISOString() })
    .eq('id', pinId)
  return !error
}

// Ban a user from posting to this venue's Board. Works on anonymous pins too —
// the RPC targets the account behind the pin server-side without ever
// revealing who it is (owner-gated inside the function).
export async function venueBanPinAuthor(pinId: string): Promise<boolean> {
  const { error } = await supabase.rpc('board_ban_pin_author', { p_pin: pinId })
  return !error
}

// ── Responses — temporary pin-scoped threads ─────────────────────────────────

// A thread goes quiet for this long → locked (matches "expires after inactivity").
export const RESPONSE_INACTIVITY_DAYS = 7

export interface ResponseThread {
  response_id: string
  pin_id: string
  zone_id: string
  zone_name: string
  pin_title: string
  pin_category: string
  pin_status: string
  responses_closed: boolean
  is_owner: boolean
  other_name: string | null // null = anonymous pin owner
  created_at: string
  last_message_at: string
  last_message: string | null
}

export interface ResponseMessage {
  id: string
  response_id: string
  sender_id: string
  content: string
  created_at: string
}

export function responseExpired(t: { last_message_at: string; pin_status: string }): boolean {
  if (t.pin_status !== 'active') return true
  const cutoff = Date.now() - RESPONSE_INACTIVITY_DAYS * 24 * 60 * 60 * 1000
  return new Date(t.last_message_at).getTime() < cutoff
}

export async function fetchMyResponseThreads(): Promise<ResponseThread[]> {
  const { data, error } = await supabase.rpc('board_my_response_threads')
  if (error) {
    console.error('[board] fetchMyResponseThreads error:', error.message)
    return []
  }
  return ((data ?? []) as ResponseThread[]).map((t) => ({
    ...t,
    other_name: t.other_name ? publicName(t.other_name) : null,
  }))
}

// Respond to a pin: creates the thread (or returns the existing one) and sends
// the first message. Notifies the pin owner.
export async function respondToPin(pin: BoardPin, firstMessage: string):
  Promise<{ ok: true; responseId: string } | { ok: false; reason: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'Not signed in.' }

  const screen = screenText(firstMessage)
  if (!screen.ok) return { ok: false, reason: 'That message can\'t be sent — tone it down and try again.' }

  // Existing thread? Just send into it.
  let responseId = pin.my_response_id
  if (!responseId) {
    // owner_id + zone_id are resolved by a server-side BEFORE INSERT trigger —
    // the responder never reads the pin's user_id, so anonymous posters stay
    // anonymous even at the API level.
    const { data: created, error } = await supabase
      .from('board_responses')
      .insert({
        pin_id: pin.id,
        zone_id: pin.zone_id,
        responder_id: user.id,
      })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[board] respondToPin error:', error?.message)
      return { ok: false, reason: 'Could not respond — the pin may be closed or complete.' }
    }
    responseId = created.id
  }

  const sent = await sendResponseMessage(responseId!, firstMessage, { pinTitle: pin.title })
  if (!sent) return { ok: false, reason: 'Could not send the message. Try again.' }
  logEvent('board_response_created', { pinId: pin.id })
  return { ok: true, responseId: responseId! }
}

export async function fetchResponseMessages(responseId: string): Promise<ResponseMessage[]> {
  const { data, error } = await supabase
    .from('board_response_messages')
    .select('*')
    .eq('response_id', responseId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[board] fetchResponseMessages error:', error.message)
    return []
  }
  return data ?? []
}

export async function sendResponseMessage(
  responseId: string,
  content: string,
  opts?: { pinTitle?: string },
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const screen = screenText(content)
  if (!screen.ok) return false

  const { error } = await supabase.from('board_response_messages').insert({
    response_id: responseId,
    sender_id: user.id,
    content: content.trim(),
  })
  if (error) {
    console.error('[board] sendResponseMessage error:', error.message)
    return false
  }

  await supabase
    .from('board_responses')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', responseId)

  // Notify the other party (non-fatal). Anonymity: the notification never
  // names anyone — it leads with the pin title instead.
  try {
    const { data: thread } = await supabase
      .from('board_responses')
      .select('responder_id, owner_id')
      .eq('id', responseId)
      .maybeSingle()
    if (thread) {
      const otherId = thread.responder_id === user.id ? thread.owner_id : thread.responder_id
      const pinTitle = opts?.pinTitle ?? 'your pin'
      sendNotification({
        userId: otherId,
        type: 'board_response',
        title: 'New response on the Board',
        body: `"${pinTitle}" has a new message.`,
        data: { type: 'board_response', response_id: responseId },
      }).catch(() => {})
    }
  } catch { /* non-fatal */ }

  return true
}

// Either party can close a thread at any time — it disappears for both.
export async function closeResponseThread(responseId: string): Promise<boolean> {
  const { error } = await supabase.from('board_responses').delete().eq('id', responseId)
  return !error
}

// ── Contact exchange (mutual consent, enforced by RLS) ──────────────────────

export interface ContactExchangeState {
  myContact: string | null
  otherContact: string | null // stays null until BOTH parties share
  otherHasShared: boolean
}

export async function fetchContactExchange(responseId: string): Promise<ContactExchangeState> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { myContact: null, otherContact: null, otherHasShared: false }

  // RLS: own row always visible; the other party's row only once both shared.
  const { data: rows } = await supabase
    .from('board_contact_shares')
    .select('user_id, contact')
    .eq('response_id', responseId)

  const mine = rows?.find((r) => r.user_id === user.id) ?? null
  const other = rows?.find((r) => r.user_id !== user.id) ?? null

  // If mutual reveal hasn't happened, we can't see the other row at all — use
  // the mutual-share RPC-backed helper to know whether they're waiting on us.
  let otherHasShared = !!other
  if (!other) {
    const { data: mutual } = await supabase.rpc('board_mutual_share', { p_response: responseId })
    // mutual=true can't happen while we can't see their row, so this only
    // distinguishes "they shared, waiting on you" when WE haven't shared yet:
    // count >= 2 requires both. If we haven't shared and mutual is false, we
    // genuinely can't know — default to false and let the UI say "invite them".
    otherHasShared = !!mutual
  }

  return {
    myContact: mine?.contact ?? null,
    otherContact: other?.contact ?? null,
    otherHasShared,
  }
}

export async function shareContact(responseId: string, contact: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase.from('board_contact_shares').upsert(
    { response_id: responseId, user_id: user.id, contact: contact.trim() },
    { onConflict: 'response_id,user_id' })
  if (!error) {
    // Nudge the other party that a contact exchange is on the table.
    try {
      const { data: thread } = await supabase
        .from('board_responses')
        .select('responder_id, owner_id')
        .eq('id', responseId)
        .maybeSingle()
      if (thread) {
        const otherId = thread.responder_id === user.id ? thread.owner_id : thread.responder_id
        sendNotification({
          userId: otherId,
          type: 'board_response',
          title: 'Contact exchange offered',
          body: 'Someone in a Board response wants to swap contact info. Share yours to reveal both.',
          data: { type: 'board_response', response_id: responseId },
        }).catch(() => {})
      }
    } catch { /* non-fatal */ }
  }
  return !error
}
