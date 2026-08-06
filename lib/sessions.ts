import { Platform } from 'react-native'
import { supabase } from './supabase'
import { getBestCoords } from './location'
import { checkUserInZone } from './zones'
import { presenceFromFix, type PresenceReading } from './presence'
import { effectiveCheckinMargin, effectivePresenceMargin } from './geofenceTuning'
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

// Per-venue geofence tuning (Jacob idea #6). A zone may override the global
// margins via zones.checkin_margin_m / presence_margin_m (see
// supabase/zone_geofence_margins.sql). NULL/missing column falls back to the
// defaults below, so this is safe before the migration runs. The venue
// dashboard only writes matched preset pairs, so presence >= checkin always
// holds — the hysteresis band is preserved.
//
// Polygon-aware defaults: a venue with a real building footprint (polygon_source
// set at OSM fetch / manual trace) uses the TIGHT polygon margins; a circle-only
// venue uses the looser circle margins. This is the fix for checking in from the
// street (Jacob, Jul 2026): the footprint is already the true shape of the place,
// so it needs almost no buffer, whereas a flat 15m buffer on a real footprint
// pushes the effective geofence back out to the sidewalk. Explicit per-venue
// overrides always win over both defaults.
async function getZoneMargins(zoneId: string): Promise<{ checkin: number; presence: number; hasPolygon: boolean }> {
  const { data } = await supabase
    .from('zones')
    .select('checkin_margin_m, presence_margin_m, polygon_source')
    .eq('id', zoneId)
    .maybeSingle()
  const hasPolygon = !!(data as any)?.polygon_source
  const checkinDefault  = hasPolygon ? POLYGON_CHECKIN_MARGIN_M  : CHECKIN_MARGIN_M
  const presenceDefault = hasPolygon ? POLYGON_PRESENCE_MARGIN_M : PRESENCE_MARGIN_M
  return {
    checkin:  (data as any)?.checkin_margin_m  ?? checkinDefault,
    presence: (data as any)?.presence_margin_m ?? presenceDefault,
    // Whether this venue has a real footprint — selects the tight vs generous
    // check-in accuracy cushion above.
    hasPolygon,
  }
}

// Geofence boundary tolerance (metres). Check-in is tighter than eviction: you
// must be within CHECKIN_MARGIN_M of the venue to check in, but you're only
// evicted once you're CLEARLY beyond PRESENCE_MARGIN_M. The gap is a hysteresis
// band so GPS jitter can't boot a stationary user (Jacob: booted at the bar)
// while the "actually here" gate stays honest at check-in. Tune against a real
// venue test — these are the two dials for the whole geofence feel.
const CHECKIN_MARGIN_M  = 15
const PRESENCE_MARGIN_M = 30
// Polygon margins (metres) — used when the venue has a real building footprint.
// Much tighter than the circle margins: the polygon is already the true shape of
// the place, so check-in needs only a small wall-jitter buffer, not a 15m ring
// that reaches the street. Hysteresis preserved (presence 25 > checkin 8). These
// two are the dials to tune on Jacob's on-site polygon test.
const POLYGON_CHECKIN_MARGIN_M  = 8
const POLYGON_PRESENCE_MARGIN_M = 25
// GPS never pins an indoor position to the metre — the OS-reported horizontal
// accuracy IS the radius of where the user actually might be. A fix whose CENTER
// lands just outside a tight building polygon can easily be a patron standing at
// the bar (Joshua at Martha My Dear: bounced with "not at this venue yet" while
// sitting inside, though the open-sky parking lot worked). So before testing the
// fence, widen it by the fix's own accuracy: "might be inside" counts as inside
// for check-in, and only "clearly outside even after allowing for GPS slop"
// counts as outside for eviction — which also stops the "booted at the bar"
// flip-flop, since a fuzzy indoor fix no longer reads as gone. Capped so a
// worst-case soft-band fix can't blow the fence wide open. This cap is the one
// dial to turn: lower it if street check-ins get too easy, raise it if real
// patrons inside still get bounced.
// The accuracy cushion math (how far the fix's own uncertainty widens the fence,
// tight for polygon check-in, generous for circles and for eviction) lives in
// lib/geofenceTuning.ts so it can be unit-tested against the geo-model. See
// effectiveCheckinMargin / effectivePresenceMargin below.
// Presence poll watches for a fix for up to this long — shorter than check-in
// since it runs on a background timer, but still multi-sampled (not one-shot).
const PRESENCE_FIX_TIMEOUT_MS = 8_000

export async function checkIn(params: {
  zoneId: string
  // All picked modes, in pick order — the first is stored as the primary
  // social_mode so existing aggregates keep working.
  socialModes: SocialMode[]
  moodMode: MoodMode
}): Promise<CheckInResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'failed' }

  // One profile read up front: the Ghost default carried into this session, and
  // whether this is the App Store review / demo account (is_demo). select('*') on
  // purpose — if the is_demo migration hasn't run yet, this still returns
  // ghost_mode instead of erroring on a missing column (is_demo just reads
  // undefined -> no bypass). Non-fatal.
  const { data: pref } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // Demo/review account bypass: the App Store reviewer is not physically at the
  // venue (they test from Cupertino or a simulator), so the GPS gate would make
  // the core feature untestable and fail review. A dedicated is_demo account —
  // and only that account — checks in without the geofence. Real users always
  // pass the fence below. See supabase/apple_demo_account.sql.
  if (pref?.is_demo) {
    return finalizeCheckIn(user.id, params, pref?.ghost_mode ?? false)
  }

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

  // Use this venue's own check-in margin if it has been tuned, else the default.
  // Widen it by the fix's horizontal accuracy so a real patron inside a building
  // — whose GPS center drifts past a tight polygon margin — isn't turned away.
  // The cushion is capped tighter for polygon venues (footprint is precise, keep
  // the fence off the street) than for circle venues (no shape, stay generous).
  const margins = await getZoneMargins(params.zoneId)
  const inZone = await checkUserInZone(
    params.zoneId,
    coords.latitude,
    coords.longitude,
    effectiveCheckinMargin(margins.checkin, margins.hasPolygon, coords.accuracy),
  )
  // null = the RPC itself failed. Don't tell the user "you're not here" on a
  // server error — let them retry.
  if (inZone === null) return { ok: false, reason: 'failed' }
  if (!inZone) {
    // A soft-band fix whose center is OUTSIDE isn't evidence either way — call
    // it low accuracy (retry) rather than "you're not here".
    if (coords.accuracy != null && coords.accuracy > MAX_CHECKIN_ACCURACY_M) {
      return fail('low_accuracy', coords.accuracy)
    }
    return fail('not_in_zone', coords.accuracy)
  }

  return finalizeCheckIn(user.id, params, pref?.ghost_mode ?? false)
}

// Write the session + zone_member rows once the entry gate (geofence, or the
// demo bypass) has passed. Shared by both paths so they can never drift.
async function finalizeCheckIn(
  userId: string,
  params: { zoneId: string; socialModes: SocialMode[]; moodMode: MoodMode },
  ghost: boolean,
): Promise<CheckInResult> {
  // Check out of any existing active session first
  await supabase
    .from('sessions')
    .update({ is_active: false, checked_out_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true)

  // Create new session. is_ghost carries the user's Ghost default (on = arrive
  // invisible until they hit "Go live").
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      zone_id: params.zoneId,
      user_id: userId,
      social_mode: params.socialModes[0],
      social_modes: params.socialModes,
      mood_mode: params.moodMode,
      is_ghost: ghost,
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
      { zone_id: params.zoneId, user_id: userId, is_present: true, last_seen_at: new Date().toISOString() },
      { onConflict: 'zone_id,user_id' }
    )

  logEvent('check_in', { zoneId: params.zoneId, socialModes: params.socialModes.join(','), moodMode: params.moodMode })
  return { ok: true, session: data }
}

// Presence verdict for an active session. 'unknown' means we couldn't get a fix
// we trust — treat it as "stay checked in", never as grounds to evict. The type
// and the mapping live in ./presence so they can be unit-tested in isolation.
export type PresenceCheck = PresenceReading

// Re-verify that a user is physically in a zone, using the SAME accuracy bar as
// check-in. This is the guard that was missing on the eviction paths: a fuzzy
// indoor fix jitters the point outside the polygon and reads as "outside" even
// when the person hasn't moved. If we wouldn't trust a fix to let someone IN, we
// won't trust it to kick them OUT — a fix fuzzier than MAX_CHECKIN_ACCURACY_M (or
// no fix at all) returns 'unknown' so the caller keeps the session alive and
// tries again next tick. Only a trustworthy, confirmed-outside fix returns
// 'outside'.
export async function verifyZonePresence(zoneId: string): Promise<PresenceCheck> {
  // Multi-sample (not one-shot): a single jittery fix near a wall could read
  // 'outside', and two of those in a row evicted a stationary user (Jacob: booted
  // at the bar). getBestCoords watches briefly and takes the tightest fix.
  const coords = await getBestCoords(MAX_CHECKIN_ACCURACY_M, PRESENCE_FIX_TIMEOUT_MS)

  // Only spend an RPC call on a fix we'd actually trust. An untrusted fix (none,
  // or accuracy worse than the check-in bar) short-circuits to 'unknown' with no
  // query. Keep-alive margin: only 'outside' when clearly beyond the geofence +
  // buffer, so edge positions and small drift never boot someone (hysteresis
  // band). Uses this venue's tuned presence margin if set. inZone is null when
  // the RPC errors, which presenceFromFix maps to 'unknown' — never an eviction.
  let inZone: boolean | null = null
  if (coords && coords.accuracy != null && coords.accuracy <= MAX_CHECKIN_ACCURACY_M) {
    const margins = await getZoneMargins(zoneId)
    // Eviction keeps the generous cushion for both venue types (loose out): a
    // fuzzy indoor fix that let someone in must not immediately boot them. This
    // is the wide end of the hysteresis band, so it stays at the full cap even
    // for polygon venues where check-in tightened.
    inZone = await checkUserInZone(
      zoneId,
      coords.latitude,
      coords.longitude,
      effectivePresenceMargin(margins.presence, coords.accuracy),
    )
  }
  return presenceFromFix(coords, inZone, MAX_CHECKIN_ACCURACY_M)
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
