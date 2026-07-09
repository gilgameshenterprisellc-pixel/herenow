import { supabase } from './supabase'

// Venue gallery photo submissions (Jacob #9). Checked-in patrons submit photos
// (status='pending'); the venue owner approves or rejects from the dashboard.

export interface PendingVenuePhoto {
  id: string
  public_url: string
  submitted_note: string | null
  created_at: string
  submitter?: { display_name: string | null } | null
}

export async function fetchPendingVenuePhotos(zoneId: string): Promise<PendingVenuePhoto[]> {
  const { data, error } = await supabase
    .from('venue_photos')
    .select('id, public_url, submitted_note, created_at, submitter:profiles!venue_photos_created_by_fkey(display_name)')
    .eq('zone_id', zoneId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[venuePhotos] fetchPending error:', error.message)
    return []
  }
  return (data ?? []) as unknown as PendingVenuePhoto[]
}

export async function fetchPendingVenuePhotoCount(zoneId: string): Promise<number> {
  const { count } = await supabase
    .from('venue_photos')
    .select('id', { count: 'exact', head: true })
    .eq('zone_id', zoneId)
    .eq('status', 'pending')
  return count ?? 0
}

export async function setVenuePhotoStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<boolean> {
  const { error } = await supabase
    .from('venue_photos')
    .update({ status })
    .eq('id', id)
  if (error) console.error('[venuePhotos] setStatus error:', error.message)
  return !error
}
