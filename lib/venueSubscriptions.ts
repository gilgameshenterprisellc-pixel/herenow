import { supabase } from './supabase'
import { logEvent } from './analytics'

// Follow vs Subscribe (Jacob, July 7 2026):
//   Follow    — from anywhere. Adds the venue to your Following list. Optional
//               notifications. Does NOT imply you've ever been there.
//   Subscribe — only while checked in. Unlocks the venue's full Updates feed.
//               A stronger, "earned" relationship — you were actually there.
// One venue_subscriptions row = a follow. is_subscriber=true = also subscribed.

export interface VenueSubscription {
  id: string
  zone_id: string
  subscribed_at: string
  is_subscriber: boolean
  zones: {
    id: string
    name: string
    type: string | null
  } | null
}

// ── Follow (from anywhere) ────────────────────────────────────────────────
export async function followVenue(zoneId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase
    .from('venue_subscriptions')
    .upsert({ user_id: user.id, zone_id: zoneId }, { onConflict: 'user_id,zone_id', ignoreDuplicates: true })
  if (!error) logEvent('venue_follow', { zoneId })
  return !error
}

export async function unfollowVenue(zoneId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  // Removing the row drops both the follow and any subscription.
  const { error } = await supabase
    .from('venue_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('zone_id', zoneId)
  return !error
}

export async function isFollowingVenue(zoneId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('venue_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('zone_id', zoneId)
    .maybeSingle()
  return !!data
}

// ── Subscribe (checked-in patrons only) ───────────────────────────────────
// Requires an active session at this venue — enforced by the caller passing a
// verified checked-in state, and belt-and-suspenders here via a session lookup.
export async function subscribeAsPatron(zoneId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('zone_id', zoneId)
    .eq('is_active', true)
    .maybeSingle()
  if (!session) return false // not checked in here — can't subscribe

  const { error } = await supabase
    .from('venue_subscriptions')
    .upsert({ user_id: user.id, zone_id: zoneId, is_subscriber: true }, { onConflict: 'user_id,zone_id' })
  if (!error) logEvent('venue_subscribe', { zoneId })
  return !error
}

export async function isSubscriberOfVenue(zoneId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('venue_subscriptions')
    .select('is_subscriber')
    .eq('user_id', user.id)
    .eq('zone_id', zoneId)
    .maybeSingle()
  return !!data?.is_subscriber
}

// ── Lists + counts ────────────────────────────────────────────────────────
export async function fetchMyVenues(): Promise<VenueSubscription[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('venue_subscriptions')
    .select('id, zone_id, subscribed_at, is_subscriber, zones(id, name, type)')
    .eq('user_id', user.id)
    .order('subscribed_at', { ascending: false })
  if (error) return []
  return (data ?? []) as unknown as VenueSubscription[]
}

export async function fetchFollowerCount(zoneId: string): Promise<number> {
  const { count } = await supabase
    .from('venue_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('zone_id', zoneId)
  return count ?? 0
}

export async function fetchSubscriberCount(zoneId: string): Promise<number> {
  const { count } = await supabase
    .from('venue_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('zone_id', zoneId)
    .eq('is_subscriber', true)
  return count ?? 0
}

// ── Back-compat aliases (existing callers treat these as "follow") ─────────
export const subscribeToVenue     = followVenue
export const unsubscribeFromVenue = unfollowVenue
export const isSubscribedToVenue  = isFollowingVenue
