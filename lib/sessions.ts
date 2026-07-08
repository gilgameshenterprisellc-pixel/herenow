import { supabase } from './supabase'
import { unlockWeMetsOnCheckout } from './weMet'
import { getCurrentCoords } from './location'
import { checkUserInZone } from './zones'
import { logEvent } from './analytics'

export type SocialMode = 'dating' | 'friends' | 'networking' | 'just_vibes'
export type MoodMode   = 'open' | 'selective' | 'not_today'

export interface Session {
  id: string
  zone_id: string
  user_id: string
  social_mode: SocialMode
  mood_mode: MoodMode
  checked_in_at: string
  checked_out_at: string | null
  is_active: boolean
}

export interface PrivacySettings {
  show_social_mode: boolean
  show_mood: boolean
  show_interests: boolean
  show_kickoff: boolean
}

export interface ActivePerson {
  session_id: string
  user_id: string
  display_name: string
  avatar_url: string | null
  social_mode: SocialMode
  mood_mode: MoodMode
  interest_tags: string[]
  kickoffs: string[]
  checked_in_at: string
  privacy_settings: PrivacySettings | null
}

export type CheckInResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not_in_zone' | 'location_unavailable' | 'failed' }

export async function checkIn(params: {
  zoneId: string
  socialMode: SocialMode
  moodMode: MoodMode
}): Promise<CheckInResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'failed' }

  // Geofence verification — must be physically at the venue to check in.
  // Without this, check-in is just a button anyone can tap from anywhere,
  // which breaks the whole "only visible to people actually here" promise.
  const coords = await getCurrentCoords()
  if (!coords) return { ok: false, reason: 'location_unavailable' }

  const inZone = await checkUserInZone(params.zoneId, coords.latitude, coords.longitude)
  if (!inZone) return { ok: false, reason: 'not_in_zone' }

  // Check out of any existing active session first
  await supabase
    .from('sessions')
    .update({ is_active: false, checked_out_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_active', true)

  // Create new session
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      zone_id: params.zoneId,
      user_id: user.id,
      social_mode: params.socialMode,
      mood_mode: params.moodMode,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[sessions] checkIn error:', error.message)
    return { ok: false, reason: 'failed' }
  }

  // Also ensure zone_member record exists
  await supabase
    .from('zone_members')
    .upsert(
      { zone_id: params.zoneId, user_id: user.id, is_present: true, last_seen_at: new Date().toISOString() },
      { onConflict: 'zone_id,user_id' }
    )

  logEvent('check_in', { zoneId: params.zoneId, socialMode: params.socialMode, moodMode: params.moodMode })
  return { ok: true, session: data }
}

export async function updateSessionModes(
  sessionId: string,
  socialMode: SocialMode,
  moodMode: MoodMode
): Promise<Session | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('sessions')
    .update({ social_mode: socialMode, mood_mode: moodMode })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[sessions] updateSessionModes error:', error.message)
    return null
  }
  return data
}

export async function checkOut(sessionId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: session } = await supabase
    .from('sessions')
    .select('zone_id, checked_in_at, zones(name)')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return

  const checkedOutAt = new Date().toISOString()
  const durationMins = Math.round(
    (Date.now() - new Date(session.checked_in_at).getTime()) / 60000
  )

  // Deactivate session
  const { error: sessionError } = await supabase
    .from('sessions')
    .update({ is_active: false, checked_out_at: checkedOutAt })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (sessionError) {
    console.error('[sessions] checkOut — failed to deactivate session:', sessionError.message)
    throw new Error(sessionError.message)
  }

  // Unlock DM windows for all confirmed We Mets from this session
  await unlockWeMetsOnCheckout(sessionId)

  // Mark not present in zone_members
  const { error: memberError } = await supabase
    .from('zone_members')
    .update({ is_present: false, last_seen_at: checkedOutAt })
    .eq('zone_id', session.zone_id)
    .eq('user_id', user.id)

  if (memberError) console.error('[sessions] checkOut — zone_members update error:', memberError.message)

  // Count We Met confirmations during this session
  const { count: wemetCount } = await supabase
    .from('we_met')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .or(`initiator_session_id.eq.${sessionId},recipient_session_id.eq.${sessionId}`)

  // Count people who were in the zone during this session
  const { count: peopleCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('zone_id', session.zone_id)
    .neq('user_id', user.id)
    .gte('checked_in_at', session.checked_in_at)

  const zoneName = (session.zones as any)?.name ?? 'this venue'

  // Build meaningful highlights for the afterglow recap
  const highlights: string[] = []
  const wc = wemetCount ?? 0
  const pc = peopleCount ?? 0
  if (wc > 0) {
    highlights.push(wc === 1 ? 'Made 1 real connection' : `Made ${wc} real connections`)
  }
  if (pc > 0) {
    highlights.push(pc === 1 ? 'Shared the space with 1 other person' : `Shared the space with ${pc} others`)
  }
  if (durationMins >= 60) {
    const h = Math.floor(durationMins / 60)
    const m = durationMins % 60
    highlights.push(m > 0 ? `${h}h ${m}m at ${zoneName}` : `${h}h at ${zoneName}`)
  } else {
    highlights.push(`${durationMins} min at ${zoneName}`)
  }

  // Create afterglow record
  const { error: afterglowError } = await supabase.from('afterglow').insert({
    session_id: sessionId,
    user_id: user.id,
    zone_id: session.zone_id,
    zone_name: zoneName,
    duration_mins: durationMins,
    we_met_count: wemetCount ?? 0,
    people_count: peopleCount ?? 0,
    highlights,
  })

  if (afterglowError) console.error('[sessions] checkOut — afterglow insert error:', afterglowError.message)

  logEvent('check_out', { zoneId: session.zone_id, durationMins, weMets: wemetCount ?? 0 })
}

export async function getActiveSession(): Promise<Session | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[sessions] getActiveSession error:', error.message)
    return null
  }

  return data
}

export async function getActivePeople(zoneId: string): Promise<ActivePerson[]> {
  const { data, error } = await supabase.rpc('active_sessions_in_zone', {
    zone_uuid: zoneId,
  })

  if (error) {
    console.error('[sessions] getActivePeople error:', error.message)
    return []
  }

  return data ?? []
}

export async function getAfterglowHistory(): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('afterglow')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return data ?? []
}

export async function getAfterglowById(sessionId: string): Promise<any | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('afterglow')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  return data
}
