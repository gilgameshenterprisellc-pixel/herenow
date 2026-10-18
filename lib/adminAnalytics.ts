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
  excluded_accounts?:  number  // team, demo and venue accounts left out of every number
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

// See supabase/pilot_dashboard_accuracy.sql. Retention is measured from each
// person's first visit; d7 = of people whose first visit was 7+ days ago, the
// share who checked in again on a night 7+ days after it. *_kept / *_of are the
// counts behind each percentage. A "check-in" here is a visit: one person, one
// venue, one night.
export interface Retention {
  d1:                      number
  d7:                      number
  d30:                     number
  d1_kept?:                number
  d1_of?:                  number
  d7_kept?:                number
  d7_of?:                  number
  d30_kept?:               number
  d30_of?:                 number
  activated_users?:        number
  avg_checkins_per_user:   number
  avg_venues_per_user:     number
  avg_session_minutes:     number
  median_session_minutes?: number
}

export async function fetchRetention(): Promise<Retention | null> {
  const { data, error } = await supabase.rpc('admin_retention')
  if (error) { console.warn('[analytics] retention:', error.message); return null }
  return data as Retention
}

// Daily numbers from Apple (supabase/app_store_daily.sql), synced by the
// app-store-analytics Edge Function. Null until that SQL has been run.
// first_downloads counts new people; redownloads are reinstalls. page_views is
// every product page view, not unique people.
export interface AppStoreSource {
  source:          string
  first_downloads: number
  redownloads:     number
  page_views:      number
}

export interface AppStoreOverview {
  connected:       boolean        // at least one sync with Apple has succeeded
  first_downloads: number
  redownloads:     number
  page_views:      number
  sources:         AppStoreSource[]
  latest_day:      string | null  // newest day Apple has reported, YYYY-MM-DD
  last_sync_at:    string | null
  last_error:      string | null  // set when the most recent sync failed
}

export async function fetchAppStoreOverview(days: number | null = null): Promise<AppStoreOverview | null> {
  const { data, error } = await supabase.rpc('admin_app_store_overview', { p_days: days })
  if (error) { console.warn('[analytics] app store:', error.message); return null }
  return data as AppStoreOverview
}
