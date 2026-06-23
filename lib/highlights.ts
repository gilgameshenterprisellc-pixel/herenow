import { supabase } from './supabase'

export interface VenueHighlight {
  id: string
  zone_id: string
  created_by: string
  title: string
  body: string | null
  emoji: string | null
  position: number
  created_at: string
}

export async function fetchHighlights(zoneId: string): Promise<VenueHighlight[]> {
  const { data } = await supabase
    .from('venue_highlights')
    .select('*')
    .eq('zone_id', zoneId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function createHighlight(params: {
  zoneId: string
  title: string
  body?: string
  emoji?: string
}): Promise<VenueHighlight | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('venue_highlights')
    .insert({
      zone_id:    params.zoneId,
      created_by: user.id,
      title:      params.title,
      body:       params.body ?? null,
      emoji:      params.emoji ?? null,
    })
    .select()
    .single()

  return data
}

export async function deleteHighlight(id: string): Promise<void> {
  await supabase.from('venue_highlights').delete().eq('id', id)
}
