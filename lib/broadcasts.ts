import { supabase } from './supabase'
import { nightStart } from './nights'

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
