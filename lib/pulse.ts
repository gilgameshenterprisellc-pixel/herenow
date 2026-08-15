import { supabase } from './supabase'
import { logEvent } from './analytics'
import { screenText } from './textModeration'
import { isSessionGhosted } from './sessions'
import { tzOffsetMs, NIGHT_TZ, NIGHT_ROLLOVER_HOUR } from './nights'

// A venue's Pulse post should clear "after they close" — we use the next 6am
// in Nashville (America/Chicago), the same night boundary the recap uses. A
// post made in the evening dies at 6am; one made at 1am dies at 6am the same
// morning. DST flips at 2am so 6am is always a stable target.
export function nextVenueNightExpiry(now: Date = new Date()): string {
  const offset = tzOffsetMs(now, NIGHT_TZ)
  const wall = new Date(now.getTime() + offset) // wall-clock time as a UTC-based Date
  const targetWall = new Date(Date.UTC(
    wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), NIGHT_ROLLOVER_HOUR, 0, 0,
  ))
  if (wall.getUTCHours() >= NIGHT_ROLLOVER_HOUR) targetWall.setUTCDate(targetWall.getUTCDate() + 1)
  // Convert the target wall time back to a real UTC instant.
  return new Date(targetWall.getTime() - offset).toISOString()
}

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
  'Lit',
  'Good vibes',
  'Music slaps',
  'Drinks flowing',
  'Dancing',
  'Chill',
  'Something wild',
  'Party mode',
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

  if (params.content && !screenText(params.content).ok) {
    console.warn('[pulse] post blocked by content filter')
    return null
  }

  // Ghost Mode (session is_ghost) means you're invisible in the venue. Posting to
  // Pulse would out your presence, so it's blocked. The composer is hidden in the
  // UI; this is the enforcement backstop for any caller.
  if (params.sessionId && await isSessionGhosted(params.sessionId)) {
    console.warn('[pulse] post blocked — user in Ghost Mode')
    return null
  }

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

// ── Reactions ───────────────────────────────────────────────────────────────
//
// Jacob (Aug 2026): "reactions would give people a lightweight way to interact
// with posts and make Pulse feel a little more alive. I don't think we need
// commenting yet."
//
// A small fixed set, not a full emoji keyboard: five taps cover the whole range
// of "I saw this and I'm into it", and a closed set has no free-text surface to
// moderate. Requires supabase/pulse_reactions.sql.

export const PULSE_REACTIONS = ['🔥', '❤️', '😂', '🙌', '🍻'] as const
export type PulseReaction = typeof PULSE_REACTIONS[number]

export interface ReactionSummary {
  /** emoji → how many people used it */
  counts: Record<string, number>
  /** the emoji this user has used on the post */
  mine: string[]
}

export const EMPTY_REACTIONS: ReactionSummary = { counts: {}, mine: [] }

/**
 * Reaction summaries for a batch of posts, in one round trip.
 *
 * Returns an empty map on error rather than throwing: reactions are decoration
 * on top of the Pulse feed, and a failure here must never blank the feed.
 */
export async function fetchPulseReactions(
  postIds: string[]
): Promise<Record<string, ReactionSummary>> {
  if (postIds.length === 0) return {}

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('pulse_reactions')
    .select('post_id, user_id, emoji')
    .in('post_id', postIds)

  if (error) {
    console.warn('[pulse] fetchPulseReactions error:', error.message)
    return {}
  }

  const out: Record<string, ReactionSummary> = {}
  for (const row of data ?? []) {
    const summary = out[row.post_id] ?? (out[row.post_id] = { counts: {}, mine: [] })
    summary.counts[row.emoji] = (summary.counts[row.emoji] ?? 0) + 1
    if (user && row.user_id === user.id) summary.mine.push(row.emoji)
  }
  return out
}

/**
 * Add or remove this user's reaction. Returns the resulting state so an
 * optimistic UI can reconcile, or null if the write failed and the caller
 * should roll back.
 */
export async function togglePulseReaction(
  postId: string,
  emoji: string
): Promise<{ reacted: boolean } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: existing, error: readErr } = await supabase
    .from('pulse_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (readErr) {
    console.warn('[pulse] togglePulseReaction read error:', readErr.message)
    return null
  }

  if (existing) {
    const { error } = await supabase.from('pulse_reactions').delete().eq('id', existing.id)
    if (error) {
      console.warn('[pulse] remove reaction error:', error.message)
      return null
    }
    return { reacted: false }
  }

  const { error } = await supabase
    .from('pulse_reactions')
    .insert({ post_id: postId, user_id: user.id, emoji })

  if (error) {
    console.warn('[pulse] add reaction error:', error.message)
    return null
  }
  logEvent('pulse_reacted', { emoji })
  return { reacted: true }
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

// Venue owner posting to their own Pulse from the dashboard — no check-in needed.
// Requires the venue-post RLS policy (supabase/jacob_venue_pulse_post.sql).
export async function createVenuePulsePost(params: {
  zoneId: string
  content?: string
  mediaUrl?: string | null
  pinned?: boolean
}): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  if (params.content && !screenText(params.content).ok) {
    console.warn('[pulse] venue post blocked by content filter')
    return false
  }

  const { error } = await supabase.from('pulse_posts').insert({
    zone_id:       params.zoneId,
    user_id:       user.id,
    session_id:    null,
    content:       params.content?.trim() || null,
    media_url:     params.mediaUrl ?? null,
    is_venue_post: true,
    is_pinned:     params.pinned ?? false,
    // Clear the venue's post after the night (next 6am Nashville), not a rolling
    // 24h — Jacob: a post from last night shouldn't still be up this morning.
    expires_at:    nextVenueNightExpiry(),
  })
  if (error) {
    console.error('[pulse] createVenuePulsePost error:', error.message)
    return false
  }
  logEvent('venue_pulse_posted', { zoneId: params.zoneId })
  return true
}
