import { supabase } from './supabase'

export interface VenueSubscription {
  id: string
  zone_id: string
  subscribed_at: string
  zones: {
    id: string
    name: string
    type: string | null
  } | null
}

export async function subscribeToVenue(zoneId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase
    .from('venue_subscriptions')
    .insert({ user_id: user.id, zone_id: zoneId })
  return !error
}

export async function unsubscribeFromVenue(zoneId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase
    .from('venue_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('zone_id', zoneId)
  return !error
}

export async function isSubscribedToVenue(zoneId: string): Promise<boolean> {
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

export async function fetchMyVenues(): Promise<VenueSubscription[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('venue_subscriptions')
    .select('id, zone_id, subscribed_at, zones(id, name, type)')
    .eq('user_id', user.id)
    .order('subscribed_at', { ascending: false })
  if (error) return []
  return (data ?? []) as unknown as VenueSubscription[]
}

export async function fetchSubscriberCount(zoneId: string): Promise<number> {
  const { count } = await supabase
    .from('venue_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('zone_id', zoneId)
  return count ?? 0
}
