import { supabase } from './supabase'

export interface Promotion {
  id: string
  zone_id: string
  created_by: string | null
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  is_active: boolean
  created_at: string
}

/** Active promotions for checked-in users (starts_at past, not expired, is_active=true) */
export async function fetchPromotions(zoneId: string): Promise<Promotion[]> {
  const { data } = await supabase
    .from('venue_promotions')
    .select('*')
    .eq('zone_id', zoneId)
    .order('starts_at', { ascending: true })
  return data ?? []
}

/** All promotions for a venue owner (includes upcoming/scheduled) */
export async function fetchAllVenuePromotions(zoneId: string): Promise<Promotion[]> {
  const { data } = await supabase
    .from('venue_promotions')
    .select('*')
    .eq('zone_id', zoneId)
    .order('starts_at', { ascending: true })
  return data ?? []
}

export async function createPromotion(params: {
  zoneId: string
  title: string
  description?: string
  startsAt?: string
  endsAt?: string
}): Promise<Promotion | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('venue_promotions')
    .insert({
      zone_id:     params.zoneId,
      created_by:  user.id,
      title:       params.title,
      description: params.description ?? null,
      starts_at:   params.startsAt ?? new Date().toISOString(),
      ends_at:     params.endsAt ?? null,
      is_active:   true,
    })
    .select()
    .single()

  return data
}

export async function deletePromotion(id: string): Promise<void> {
  await supabase.from('venue_promotions').delete().eq('id', id)
}

export async function togglePromotion(id: string, isActive: boolean): Promise<void> {
  await supabase.from('venue_promotions').update({ is_active: isActive }).eq('id', id)
}
