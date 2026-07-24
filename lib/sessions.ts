import { Platform } from 'react-native'
import { supabase } from './supabase'
import { getCurrentCoords, getBestCoords } from './location'
import { checkUserInZone } from './zones'
import { logEvent } from './analytics'
import { publicName } from './format'
import { scheduleMorningRecapAlert } from './notifications'

export type SocialMode = 'dating' | 'friends' | 'networking' | 'just_vibes'
export type MoodMode   = 'open' | 'selective' | 'not_today'

export interface Session {
  id: string
  zone_id: string
  user_id: string
  // Primary (first-picked) mode — kept so existing aggregates don't change.
  social_mode: SocialMode
  // Every mode the user picked ("dating but also friends"). Null on rows from
  // before the multi-select rollout — fall back to [social_mode].
  social_modes: SocialMode[] | null
  mood_mode: MoodMode
  // Ghost is its own toggle, independent of mood: invisible in the room + walled
  // off from it. Set from the user's profile default at check-in, toggleable
  // in-venue ("Go live") and from Settings.
  is_ghost: boolean
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
  social_modes: SocialMode[] | null
  mood_mode: MoodMode
  interest_tags: string[]
  kickoffs: string[]
  checked_in_at: string
  privacy_settings: PrivacySettings | null
}

// Every mode on a session/person, tolerating pre-rollout rows where only the
// single social_mode column exists.
export function allSocialModes(x: { social_mode: SocialMode; social_modes?: SocialMode[] | null }): SocialMode[] {
  return (x.social_modes && x.social_modes.length > 0) ? x.social_modes : [x.social_mode]
}

export type CheckInResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not_in_zone' | 'location_unavailable' | 'low_accuracy' | 'precise_off' | 'failed' }

// A GPS fix fuzzier than this can't be trusted to place someone inside a venue —
// a poor fix on the street can land inside the building footprint by chance.
// Reject it and ask the user to try again rather than allow a false check-in.
const MAX_CHECKIN_ACCURACY_M = 60

// Older iPhones (single-frequency GPS) often bottom out at 60–90m indoors even
// after sampling — three people at the July venue test couldn't check in at
// all. A fix in this band is accepted for CHECK-IN only when its center lands
// inside the venue geofence: the reported center is usually near the true
// position even when the confidence radius is wide, and eviction still uses
// the strict 60m bar, so a rare street-side false positive self-corrects.
const SOFT_CHECKIN_ACCURACY_M = 90

// Accuracy this bad isn't GPS noise — it's iOS "Precise Location" turned off
// (reduced accuracy is ~1–5km on purpose). Tell the user exactly that instead
// of a generic "try again".
const REDUCED_ACCURACY_HINT_M = 500

// How long the check-in fix sampler is allowed to watch for a good reading.
const CHECKIN_FIX_TIMEOUT_MS = 15_000

export async function checkIn(params: {
  zoneId: string
  // All picked modes, in pick order — the first is stored as the primary
  // social_mode so existing aggregates keep working.
  socialModes: SocialMode[]
  moodMode: MoodMode
}): Promise<CheckInResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'failed' }

  // Every failure is logged with the accuracy we saw and the device OS so we
  // can see patterns like "old iPhones fail the gate" in the data instead of
  // hearing about it at a venue test.
  const fail = (reason: 'not_in_zone' | 'location_unavailable' | 'low_accuracy' | 'precise_off', accuracy: number | null): CheckInResult => {
    logEvent('check_in_failed', {
      zoneId: params.zoneId, reason, accuracy,
      os: Platform.OS, osVersion: String(Platform.Version),
    })
    return { ok: false, reason }
  }

  // Geofence verification — must be physically at the venue to check in.
  // Without this, check-in is just a button anyone can tap from anywhere,
  // which breaks the whole "only visible to people actually here" promise.
  // Sample fixes for up to 15s and take the best — older phones need a few
  // seconds to converge from a coarse cell/wifi estimate to real GPS.
  const coords = await getBestCoords(MAX_CHECKIN_ACCURACY_M, CHECKIN_FIX_TIMEOUT_MS)
  if (!coords) return fail('location_unavailable', null)

  // Don't trust a fuzzy fix to prove presence — a poor reading on the street can
  // fall inside the building footprint. Better to ask for a retry than to let
  // someone check in from outside the venue. Fixes in the 60–90m band get one
  // more chance below: they pass only if their center is inside the geofence.
  if (coords.accuracy != null && coords.accuracy > SOFT_CHECKIN_ACCURACY_M) {
    return fail(coords.accuracy > REDUCED_ACCURACY_HINT_M ? 'precise_off' : 'low_accuracy', coords.accuracy)
  }

  const inZone = await checkUserInZone(params.zoneId, coords.latitude, coords.longitude)
  if (!inZone) {
    // A soft-band fix whose center is OUTSIDE isn't evidence either way — call
    // it low accuracy (retry) rather than "you're not here".
    if (coords.accuracy != null && coords.accuracy > MAX_CHECKIN_ACCURACY_M) {
      return fail('low_accuracy', coords.accuracy)
    }
    return fail('not_in_zone', coords.accuracy)
  }

  // Check out of any existing active session first
  await supabase
    .from('sessions')
    .update({ is_active: false, checked_out_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_active', true)

  // Carry the user's Ghost default into this check-in. If it's on, they arrive
  // invisible until they hit "Go live". Non-fatal: default to not ghosted.
  const { data: pref } = await supabase
    .from('profiles')
    .select('ghost_mode')
    .eq('id', user.id)
    .maybeSingle()

  // Create new session
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      zone_id: params.zoneId,
      user_id: user.id,
      social_mode: params.socialModes[0],
      social_modes: params.socialModes,
      mood_mode: params.moodMode,
      is_ghost: pref?.ghost_mode ?? false,
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

  logEvent('check_in', { zoneId: params.zoneId, socialModes: params.socialModes.join(','), moodMode: params.moodMode })
  return { ok: true, session: data }
}

// Presence verdict for an active session. 'unknown' means we couldn't get a fix
// we trust — treat it as "stay checked in", never as grounds to evict.
export type PresenceCheck = 'inside' | 'outside' | 'unknown'

// Re-verify that a user is physically in a zone, using the SAME accuracy bar as
// check-in. This is the guard that was missing on the eviction paths: a fuzzy
// indoor fix jitters the point outside the polygon and reads as "outside" even
// when the person hasn't moved. If we wouldn't trust a fix to let someone IN, we
// won't trust it to kick them OUT — a fix fuzzier than MAX_CHECKIN_ACCURACY_M (or
// no fix at all) returns 'unknown' so the caller keeps the session alive and
// tries again next tick. Only a trustworthy, confirmed-outside fix returns
// 'outside'.
export async function verifyZonePresence(zoneId: string): Promise<PresenceCheck> {
  const coords = await getCurrentCoords()
  if (!coords) return 'unknown'
  if (coords.accuracy == null || coords.accuracy > MAX_CHECKIN_ACCURACY_M) return 'unknown'

  const inZone = await checkUserInZone(zoneId, coords.latitude, coords.longitude)
  return inZone ? 'inside' : 'outside'
}

export async function updateSessionModes(
  sessionId: string,
  socialModes: SocialMode[],
  moodMode: MoodMode
): Promise<Session | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('sessions')
    .update({ social_mode: socialModes[0], social_modes: socialModes, mood_mode: moodMode })
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

// Ends a session and writes the Afterglow recap. Returns the venue name so the
// auto-checkout callers (geofence exit, presence eviction) can name the place in
// the "you've been checked out" notification. Idempotent: if the session is
// already checked out, it returns null and does nothing — a session can't fire
// two notifications or write two afterglow rows when the background task and the
// foreground verifier both reach for it.
export async function checkOut(sessionId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: session } = await supabase
    .from('sessions')
    .select('zone_id, checked_in_at, checked_out_at, zones(name)')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!session) return null
  // Already checked out — nothing to do (and nothing to notify about again).
  if (session.checked_out_at) return null

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

  // (First 48 rules: DM windows now open at We Met confirmation, not at checkout)

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

  // Nudge the user to open their recap in the morning. Fire-and-forget so it
  // never delays checkout; deduped so a multi-venue night fires only one alert.
  scheduleMorningRecapAlert().catch(() => {})

  logEvent('check_out', { zoneId: session.zone_id, durationMins, weMets: wemetCount ?? 0 })

  return zoneName
}

// Presence heartbeat — keeps a checked-in user counted as "here". If the app
// stops touching a session (user leaves + closes the app), it goes stale and
// drops out of the live count within the staleness window. Fire-and-forget.
export async function touchSession(sessionId: string): Promise<void> {
  await supabase
    .from('sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('is_active', true)
}

// Deactivate any active session before signing out, so a user is never left
// "checked in" after they leave (Jacob safety feedback). Non-fatal.
export async function checkOutActiveOnSignOut(): Promise<void> {
  try {
    const session = await getActiveSession()
    if (session) await checkOut(session.id)
  } catch (e) {
    console.error('[sessions] checkOutActiveOnSignOut error:', e)
  }
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

  // Others see you as first name + last initial (privacy).
  return ((data ?? []) as ActivePerson[]).map((p) => ({ ...p, display_name: publicName(p.display_name) }))
}

// Ghost Mode is a session flagged is_ghost — the user is invisible in the venue
// (filtered out of the people list at the RPC) and walled off from the room.
// Posting to Pulse or Chat would reveal their presence, so those paths check
// this first. Returns false on any lookup error so a transient glitch never
// silently blocks a normal post.
export async function isSessionGhosted(sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sessions')
    .select('is_ghost')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) {
    console.error('[sessions] isSessionGhosted error:', error.message)
    return false
  }
  return data?.is_ghost === true
}

// Toggle Ghost on the active session (the in-venue "Go live" button and the
// Settings toggle both use this). Returns the updated session.
export async function setSessionGhost(sessionId: string, ghost: boolean): Promise<Session | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('sessions')
    .update({ is_ghost: ghost })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[sessions] setSessionGhost error:', error.message)
    return null
  }
  return data
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
