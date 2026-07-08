import { supabase } from './supabase'
import { logEvent } from './analytics'

// Venue submissions (Jacob Q8): users nominate a venue → admin review queue →
// approve spins up a live (unclaimed) zone. Outreach/claim stays manual for the
// beta, which Jacob accepted ("we may have to do it manually" at first). Free —
// no email infra needed; the admin has the contact in the queue.

export interface VenueSubmission {
  id: string
  submitted_by: string | null
  name: string
  category: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  venue_contact: string | null
  note: string | null
  status: 'pending' | 'approved' | 'dismissed'
  created_at: string
  submitter?: { display_name: string | null } | null
}

export async function submitVenue(params: {
  name: string
  category?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  venueContact?: string | null
  note?: string | null
}): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase.from('venue_submissions').insert({
    submitted_by:  user.id,
    name:          params.name.trim(),
    category:      params.category ?? null,
    address:       params.address?.trim() || null,
    latitude:      params.latitude ?? null,
    longitude:     params.longitude ?? null,
    venue_contact: params.venueContact?.trim() || null,
    note:          params.note?.trim() || null,
  })

  if (error) {
    console.error('[venueSubmissions] submitVenue error:', error.message)
    return false
  }
  logEvent('venue_suggested')
  return true
}

// ── Admin ─────────────────────────────────────────────────────────────────
export async function fetchPendingSubmissions(): Promise<VenueSubmission[]> {
  const { data, error } = await supabase
    .from('venue_submissions')
    .select('*, submitter:profiles!venue_submissions_submitted_by_fkey(display_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as unknown as VenueSubmission[]
}

// Approve → create a live but unclaimed zone from the submission.
// Requires coordinates: zones.center_lat/center_lng are NOT NULL, so a submission
// with only a typed address can't go live until someone adds a GPS pin.
export async function approveSubmission(sub: VenueSubmission): Promise<boolean> {
  if (sub.latitude == null || sub.longitude == null) return false

  const insert: Record<string, unknown> = {
    name:          sub.name,
    category:      sub.category,
    is_active:     true,
    radius_meters: 75,
    center:        `POINT(${sub.longitude} ${sub.latitude})`,
    center_lat:    sub.latitude,
    center_lng:    sub.longitude,
  }

  const { error: zoneErr } = await supabase.from('zones').insert(insert)
  if (zoneErr) {
    console.error('[venueSubmissions] approve → zone insert error:', zoneErr.message)
    return false
  }

  const { error } = await supabase
    .from('venue_submissions')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', sub.id)
  return !error
}

export async function dismissSubmission(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('venue_submissions')
    .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}
