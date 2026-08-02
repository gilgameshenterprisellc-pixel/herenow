import { supabase } from './supabase'

// Admin analytics for the Neighborhood Pilot dashboard. Thin wrappers over the
// SECURITY DEFINER RPCs in supabase/admin_analytics.sql — all admin-gated in the
// DB, so a non-admin call just errors and we return an empty result.

export interface PilotOverview {
  total_scans:         number
  scans_7d:            number
  total_accounts:      number
  accounts_7d:         number
  profiles_completed:  number
  total_checkins:      number
  checkins_7d:         number
  checked_in_users:    number
  repeat_users:        number
  multi_venue_users:   number
  wau:                 number
  mau:                 number
  total_subscriptions: number
  total_venues:        number
}

// days: null = all time, or 7 / 30 / 90 for a rolling window.
export async function fetchPilotOverview(days: number | null = null): Promise<PilotOverview | null> {
  const { data, error } = await supabase.rpc('admin_pilot_overview', { p_days: days })
  if (error) { console.warn('[analytics] overview:', error.message); return null }
  return data as PilotOverview
}

export interface VenuePerformance {
  zone_id:            string
  name:               string
  checkins:           number
  unique_visitors:    number
  returning_visitors: number
  scans:              number
  attributed_signups: number
  subscriptions:      number
}

export async function fetchVenuePerformance(days: number | null = null): Promise<VenuePerformance[]> {
  const { data, error } = await supabase.rpc('admin_venue_performance', { p_days: days })
  if (error) { console.warn('[analytics] venues:', error.message); return [] }
  return (data as VenuePerformance[]) ?? []
}

export interface PlacementStat {
  placement: string
  scans:     number
}

export async function fetchPlacementStats(days: number | null = null): Promise<PlacementStat[]> {
  const { data, error } = await supabase.rpc('admin_qr_placement_stats', { p_days: days })
  if (error) { console.warn('[analytics] placements:', error.message); return [] }
  return (data as PlacementStat[]) ?? []
}

export interface Retention {
  d1:                    number  // rolling retention %, see admin_retention.sql
  d7:                    number
  d30:                   number
  avg_checkins_per_user: number
  avg_venues_per_user:   number
  avg_session_minutes:   number
}

export async function fetchRetention(): Promise<Retention | null> {
  const { data, error } = await supabase.rpc('admin_retention')
  if (error) { console.warn('[analytics] retention:', error.message); return null }
  return data as Retention
}
