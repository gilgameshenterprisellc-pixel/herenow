import { supabase } from './supabase'

// Venue owner hides a guest's Pulse post or Chat message in their own zone.
// Backed by the venue_moderate_content RPC (owner-scoped, sets is_hidden).
export async function hideVenueContent(
  type: 'pulse' | 'chat',
  contentId: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('venue_moderate_content', {
    p_content_type: type,
    p_content_id: contentId,
    p_hidden: true,
  })
  if (error) {
    console.error('[venueModeration] hide error:', error.message)
    return false
  }
  return true
}

// Venue owner mutes a guest in their room. `until` is an ISO timestamp for a
// timeout, or null for an indefinite block. Enforced by a DB trigger.
export async function muteVenueUser(
  zoneId: string,
  userId: string,
  until: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from('venue_muted_users')
    .upsert({ zone_id: zoneId, user_id: userId, muted_until: until }, { onConflict: 'zone_id,user_id' })
  if (error) {
    console.error('[venueModeration] mute error:', error.message)
    return false
  }
  return true
}
