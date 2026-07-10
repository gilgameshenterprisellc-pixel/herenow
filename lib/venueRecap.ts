import { supabase } from './supabase'

export interface VenueRecap {
  date: string
  total_checkins: number
  unique_visitors: number
  new_visitors: number
  returning: number
  avg_dwell_mins: number
  peak_hour: number | null
  social_modes: Record<string, number>
  came_from: { venue: string; count: number }[]
  went_to: { venue: string; count: number }[]
}

// Aggregate-only nightly recap for a venue. All cross-venue flow is anonymized
// server-side (3+ patron threshold). date is 'YYYY-MM-DD'.
export async function fetchVenueRecap(zoneId: string, date: string): Promise<VenueRecap | null> {
  const { data, error } = await supabase.rpc('venue_daily_recap', { p_zone_id: zoneId, p_date: date })
  if (error) {
    console.error('[venueRecap] error:', error.message)
    return null
  }
  return data as VenueRecap
}
