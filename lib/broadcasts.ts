import { Platform } from 'react-native'
import { supabase } from './supabase'
import { nightStart } from './nights'
import { cityForPoint, defaultCity, slotsLeft, UNIVERSAL_FEED_WINDOW_DAYS, type City } from './universalFeed'

export interface VenueAnnouncement {
  id: string
  zone_id: string
  message: string
  image_url: string | null
  audience: string | null
  publish_at: string
}

// Tonight's announcements for the venue's Pulse (Jacob, Oct 29: checked-in guests
// see a venue's announcements in Updates and the Pulse, follow or not). Only
// what has gone out since 6am; scheduled ones stay hidden until their time, and
// the database hides them from everyone but the owner until then as well
// (supabase/broadcast_reach_oct29.sql).
export async function fetchTonightsAnnouncements(
  zoneId: string,
  opts: { subscriber: boolean },
): Promise<VenueAnnouncement[]> {
  const now = new Date()
  const { data, error } = await supabase
    .from('venue_announcements')
    .select('id, zone_id, message, image_url, audience, publish_at')
    .eq('zone_id', zoneId)
    .gte('publish_at', nightStart(now).toISOString())
    .lte('publish_at', now.toISOString())
    .order('publish_at', { ascending: false })
    .limit(10)
  if (error) {
    console.warn('[broadcasts] fetchTonightsAnnouncements failed:', error.message)
    return []
  }
  return ((data ?? []) as VenueAnnouncement[])
    .filter((a) => a.audience !== 'subscribers' || opts.subscriber)
}

// ── Universal Feed ────────────────────────────────────────────────────────────

export interface UniversalItem {
  kind: 'announcement' | 'promotion'
  id: string
  zone_id: string
  zone_name: string
  message?: string
  title?: string
  description?: string | null
  discount_label?: string | null
  at: string
}

export async function fetchCities(): Promise<City[]> {
  const { data, error } = await supabase.from('cities').select('slug, name, lat, lng, radius_km')
  if (error) { console.warn('[broadcasts] fetchCities failed:', error.message); return [] }
  return (data ?? []) as City[]
}

/** Times of this venue's city feed posts in the last week (owner-only via RLS). */
export async function fetchUniversalSlots(zoneId: string): Promise<ReturnType<typeof slotsLeft>> {
  const since = new Date(Date.now() - UNIVERSAL_FEED_WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('universal_broadcasts')
    .select('created_at')
    .eq('zone_id', zoneId)
    .gt('created_at', since)
  if (error) console.warn('[broadcasts] fetchUniversalSlots failed:', error.message)
  return slotsLeft((data ?? []).map((r: { created_at: string }) => r.created_at))
}

// Where the viewer is right now, without ever showing a permission prompt from
// the Updates tab: only if location is already allowed.
async function quietCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) return null
      const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
      if (perm.state !== 'granted') return null
      return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 5_000 },
        )
      })
    }
    const Location = require('expo-location')
    const { status } = await Location.getForegroundPermissionsAsync()
    if (status !== 'granted') return null
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }))
      ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }))
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null
  } catch {
    return null
  }
}

// Which city's Universal Feed to show (Jacob: someone visiting Nashville sees
// Nashville's, wherever they live). Where they are now if location is allowed;
// otherwise the city of the last venue they checked in to; and for someone
// brand new with neither, the default city (Jacob, Oct 30). Location that is
// allowed and outside every city means no feed: then we know they're elsewhere.
export async function viewerCity(cities: City[]): Promise<City | null> {
  if (cities.length === 0) return null
  const here = await quietCoords()
  if (here) return cityForPoint(here.lat, here.lng, cities)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('sessions')
    .select('checked_in_at, zones(city_slug)')
    .eq('user_id', user.id)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) { console.warn('[broadcasts] last check-in lookup failed:', error.message); return null }
  if (!data) return defaultCity(cities)
  const slug = (data as any)?.zones?.city_slug as string | undefined
  return cities.find((c) => c.slug === slug) ?? null
}

// The city's public broadcasts from the last week: announcements that have gone
// out and promotions that are live right now.
export async function fetchUniversalFeed(citySlug: string): Promise<UniversalItem[]> {
  const now = new Date().toISOString()
  const since = new Date(Date.now() - UNIVERSAL_FEED_WINDOW_DAYS * 86_400_000).toISOString()
  const [annos, promos] = await Promise.all([
    supabase
      .from('venue_announcements')
      .select('id, zone_id, message, publish_at, zones!inner(name, city_slug)')
      .eq('post_to_feed', true)
      .eq('zones.city_slug', citySlug)
      .gte('publish_at', since)
      .lte('publish_at', now)
      .order('publish_at', { ascending: false })
      .limit(20),
    supabase
      .from('venue_promotions')
      .select('id, zone_id, title, description, discount_label, created_at, zones!inner(name, city_slug)')
      .eq('post_to_feed', true)
      .eq('zones.city_slug', citySlug)
      .gte('created_at', since)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (annos.error) console.warn('[broadcasts] universal announcements failed:', annos.error.message)
  if (promos.error) console.warn('[broadcasts] universal promotions failed:', promos.error.message)
  return [
    ...(annos.data ?? []).map((a: any): UniversalItem => ({
      kind: 'announcement', id: a.id, zone_id: a.zone_id, zone_name: a.zones?.name ?? 'Venue',
      message: a.message, at: a.publish_at,
    })),
    ...(promos.data ?? []).map((p: any): UniversalItem => ({
      kind: 'promotion', id: p.id, zone_id: p.zone_id, zone_name: p.zones?.name ?? 'Venue',
      title: p.title, description: p.description, discount_label: p.discount_label, at: p.created_at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
