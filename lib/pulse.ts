import { supabase } from './supabase'
import { logEvent } from './analytics'
import { screenText } from './textModeration'
import { isSessionGhosted } from './sessions'

// Milliseconds to add to a UTC instant to get wall-clock time in `tz`.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value])) as Record<string, string>
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - date.getTime()
}

// A venue's Pulse post should clear "after they close" — we use the next 6am
// in Nashville (America/Chicago), the same night boundary the recap uses. A
// post made in the evening dies at 6am; one made at 1am dies at 6am the same
// morning. DST flips at 2am so 6am is always a stable target.
export function nextVenueNightExpiry(now: Date = new Date()): string {
  const tz = 'America/Chicago'
  const offset = tzOffsetMs(now, tz)
  const wall = new Date(now.getTime() + offset) // wall-clock time as a UTC-based Date
  const targetWall = new Date(Date.UTC(
    wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 6, 0, 0,
  ))
  if (wall.getUTCHours() >= 6) targetWall.setUTCDate(targetWall.getUTCDate() + 1)
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
