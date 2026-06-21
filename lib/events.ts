import { supabase } from './supabase'

export interface VenueEvent {
  id: string
  zone_id: string
  created_by: string | null
  title: string
  description: string | null
  event_type: string
  starts_at: string
  ends_at: string | null
  rsvp_count: number
  created_at: string
  user_rsvpd?: boolean
}

export async function fetchEvents(zoneId: string): Promise<VenueEvent[]> {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('venue_events')
    .select('*')
    .eq('zone_id', zoneId)
    .gte('starts_at', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
    .order('starts_at', { ascending: true })

  if (error) {
    console.error('[events] fetchEvents error:', error.message)
    return []
  }

  if (!user || !data) return (data as VenueEvent[]) ?? []

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('event_id')
    .eq('user_id', user.id)
    .in('event_id', data.map((e: any) => e.id))

  const rsvpSet = new Set(rsvps?.map((r: any) => r.event_id) ?? [])

  return data.map((e: any) => ({ ...e, user_rsvpd: rsvpSet.has(e.id) }))
}

export async function createEvent(params: {
  zoneId: string
  title: string
  description?: string
  eventType?: string
  startsAt: string
  endsAt?: string
}): Promise<VenueEvent | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('venue_events')
    .insert({
      zone_id: params.zoneId,
      created_by: user.id,
      title: params.title,
      description: params.description ?? null,
      event_type: params.eventType ?? 'general',
      starts_at: params.startsAt,
      ends_at: params.endsAt ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[events] createEvent error:', error.message)
    return null
  }

  return data
}

export async function toggleRsvp(eventId: string, currentlyRsvpd: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  if (currentlyRsvpd) {
    await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', user.id)

    await supabase
      .from('venue_events')
      .update({ rsvp_count: supabase.rpc('greatest', { a: 0, b: -1 }) as any })
      .eq('id', eventId)
  } else {
    await supabase
      .from('event_rsvps')
      .upsert({ event_id: eventId, user_id: user.id }, { onConflict: 'event_id,user_id' })

    const { error: rpcError } = await supabase.rpc('increment_event_rsvp', { event_uuid: eventId })
    if (rpcError) {
      const { data } = await supabase.from('venue_events').select('rsvp_count').eq('id', eventId).single()
      if (data) {
        await supabase.from('venue_events').update({ rsvp_count: data.rsvp_count + 1 }).eq('id', eventId)
      }
    }
  }
}
