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
