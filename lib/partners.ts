import { supabase } from './supabase'
import { nightStart } from './nights'
import { logEvent } from './analytics'
import { sendNotification } from './notifications'

// Venue partners (Jacob, Oct 29): a venue makes an organization its partner for
// an event or a date range — Monster at Skinny Dennis — and picks what it may
// do while that lasts: broadcast to the people checked in, run contests and
// add events there, see the activation's numbers. Rules and RLS live in
// supabase/venue_partners_oct30.sql; status math in lib/partnerStatus.ts.

export interface VenuePartner {
  id: string
  zone_id: string
  org_id: string
  label: string | null
  can_broadcast: boolean
  can_host: boolean
  can_view_stats: boolean
  starts_at: string
  ends_at: string
  revoked_at: string | null
  created_at: string
  organizations: { id: string; name: string; category: string | null; owner_id: string } | null
  zones: { id: string; name: string; owner_id: string | null } | null
}

export interface PartnerBroadcast {
  id: string
  partner_id: string
  zone_id: string
  org_id: string
  message: string
  created_at: string
  organizations?: { name: string } | null
  zones?: { name: string } | null
}

export interface PartnerStats {
  check_ins: number
  guests: number
  here_now: number
  broadcasts: number
  broadcast_reach: number
  contest_entries: number
  new_members: number
}

export interface OrgResult { id: string; name: string; category: string | null; owner_id: string }

const PARTNER_SELECT = '*, organizations(id, name, category, owner_id), zones(id, name, owner_id)'

const when = (d: Date) => d.toLocaleString([], {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

function warn(where: string, error: { message: string } | null) {
  if (error) console.warn(`[partners] ${where} failed:`, error.message)
}

/** Organizations a venue can make a partner, by name. */
export async function searchOrganizations(query: string): Promise<OrgResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, category, owner_id')
    .eq('status', 'active')
    .ilike('name', `%${q.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(10)
  warn('searchOrganizations', error)
  return (data ?? []) as OrgResult[]
}

export async function fetchVenuePartners(zoneId: string): Promise<VenuePartner[]> {
  const { data, error } = await supabase
    .from('venue_partners').select(PARTNER_SELECT)
    .eq('zone_id', zoneId).order('starts_at', { ascending: false }).limit(100)
  warn('fetchVenuePartners', error)
  return (data ?? []) as unknown as VenuePartner[]
}

export async function fetchOrgPartnerships(orgId: string): Promise<VenuePartner[]> {
  const { data, error } = await supabase
    .from('venue_partners').select(PARTNER_SELECT)
    .eq('org_id', orgId).order('starts_at', { ascending: false }).limit(100)
  warn('fetchOrgPartnerships', error)
  return (data ?? []) as unknown as VenuePartner[]
}

export async function fetchPartner(id: string): Promise<VenuePartner | null> {
  const { data, error } = await supabase
    .from('venue_partners').select(PARTNER_SELECT).eq('id', id).maybeSingle()
  warn('fetchPartner', error)
  return (data ?? null) as unknown as VenuePartner | null
}

/** Live partners for the venue page ("Presented with Monster"). */
export async function fetchLivePartners(zoneId: string): Promise<VenuePartner[]> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('venue_partners').select(PARTNER_SELECT)
    .eq('zone_id', zoneId).is('revoked_at', null)
    .lte('starts_at', now).gte('ends_at', now)
  warn('fetchLivePartners', error)
  return (data ?? []) as unknown as VenuePartner[]
}

export async function grantPartner(params: {
  zoneId: string
  venueName: string
  org: OrgResult
  label: string
  canBroadcast: boolean
  canHost: boolean
  canViewStats: boolean
  startsAt: Date
  endsAt: Date
}): Promise<{ ok: boolean; message?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Sign in again.' }
  const { data, error } = await supabase
    .from('venue_partners')
    .insert({
      zone_id: params.zoneId,
      org_id: params.org.id,
      label: params.label.trim() || null,
      can_broadcast: params.canBroadcast,
      can_host: params.canHost,
      can_view_stats: params.canViewStats,
      starts_at: params.startsAt.toISOString(),
      ends_at: params.endsAt.toISOString(),
      granted_by: user.id,
    })
    .select('id')
    .single()
  if (error || !data) {
    warn('grantPartner', error)
    return { ok: false, message: 'Could not add that partner. Try again.' }
  }
  logEvent('venue_partner_granted', { zoneId: params.zoneId, orgId: params.org.id })
  // Tell the organization's owner, so they know where to find it.
  sendNotification({
    userId: params.org.owner_id,
    type: 'venue_partner',
    title: `${params.venueName} made ${params.org.name} a partner`,
    body: `${params.label.trim() || 'Partnership'}: ${when(params.startsAt)} to ${when(params.endsAt)}`,
    data: { partner_id: data.id, zone_id: params.zoneId },
  }).catch(() => {})
  return { ok: true }
}

export async function revokePartner(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('venue_partners').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  warn('revokePartner', error)
  return !error
}

export async function fetchPartnerStats(id: string): Promise<PartnerStats | null> {
  const { data, error } = await supabase.rpc('partner_stats', { p_partner: id })
  warn('partner_stats', error)
  return (data ?? null) as PartnerStats | null
}

export async function fetchPartnerBroadcasts(partnerId: string): Promise<PartnerBroadcast[]> {
  const { data, error } = await supabase
    .from('partner_broadcasts').select('*')
    .eq('partner_id', partnerId).order('created_at', { ascending: false }).limit(50)
  warn('fetchPartnerBroadcasts', error)
  return (data ?? []) as PartnerBroadcast[]
}

export async function sendPartnerBroadcast(partner: VenuePartner, message: string): Promise<{ ok: boolean; row?: PartnerBroadcast }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const { data, error } = await supabase
    .from('partner_broadcasts')
    .insert({
      partner_id: partner.id,
      zone_id: partner.zone_id,
      org_id: partner.org_id,
      created_by: user.id,
      message: message.trim(),
    })
    .select('*')
    .single()
  warn('sendPartnerBroadcast', error)
  if (error || !data) return { ok: false }
  logEvent('partner_broadcast_sent', { zoneId: partner.zone_id, partnerId: partner.id })
  return { ok: true, row: data as PartnerBroadcast }
}

export async function deletePartnerBroadcast(id: string): Promise<boolean> {
  const { error } = await supabase.from('partner_broadcasts').delete().eq('id', id)
  warn('deletePartnerBroadcast', error)
  return !error
}

// Tonight's partner broadcasts at the venue you're checked in to. The database
// only returns them while you're checked in there (Jacob: "Sponsor broadcasts
// only show up in the user's feed while they're checked in"). A guest seeing one
// counts toward the partner's reach; the venue or partner looking does not.
export async function fetchTonightsPartnerBroadcasts(
  zoneId: string,
  opts: { countView: boolean },
): Promise<PartnerBroadcast[]> {
  const { data, error } = await supabase
    .from('partner_broadcasts')
    .select('*, organizations(name), zones(name)')
    .eq('zone_id', zoneId)
    .gte('created_at', nightStart().toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  warn('fetchTonightsPartnerBroadcasts', error)
  const rows = (data ?? []) as PartnerBroadcast[]
  if (rows.length > 0 && opts.countView) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: viewError } = await supabase
        .from('partner_broadcast_views')
        .upsert(rows.map((r) => ({ broadcast_id: r.id, user_id: user.id })),
          { onConflict: 'broadcast_id,user_id', ignoreDuplicates: true })
      warn('log partner broadcast views', viewError)
    }
  }
  return rows
}
