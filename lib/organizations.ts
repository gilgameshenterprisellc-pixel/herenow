import { supabase } from './supabase'
import { logEvent } from './analytics'
import { sendNotification } from './notifications'
import { screenText } from './textModeration'

// Organizations (Jacob, July 2026): clubs, leagues, brands, and communities
// that run their thing at a host venue — e.g. a backgammon club that meets at
// a bar. The org promotes to its members and gets venue-style basics
// (member count, event RSVPs) without being a venue itself.

export type OrgCategory = 'club' | 'league' | 'community' | 'brand' | 'creators' | 'other'

export const ORG_CATEGORIES: { id: OrgCategory; label: string; emoji: string }[] = [
  { id: 'club',      label: 'Club',       emoji: '🎲' },
  { id: 'league',    label: 'League',     emoji: '🏆' },
  { id: 'community', label: 'Community',  emoji: '🫂' },
  { id: 'brand',     label: 'Brand',      emoji: '✨' },
  { id: 'creators',  label: 'Creators',   emoji: '🎨' },
  { id: 'other',     label: 'Other',      emoji: '📍' },
]

export interface Organization {
  id: string
  owner_id: string
  name: string
  description: string | null
  category: OrgCategory
  host_zone_id: string | null
  status: 'active' | 'suspended'
  created_at: string
  zones?: { id: string; name: string } | null
}

export interface OrgPost {
  id: string
  org_id: string
  title: string
  body: string | null
  created_at: string
}

export async function createOrganization(params: {
  name: string
  description?: string
  category: OrgCategory
  hostZoneId?: string | null
}): Promise<Organization | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  if (!screenText(params.name).ok || (params.description && !screenText(params.description).ok)) {
    return null
  }

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      owner_id: user.id,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      category: params.category,
      host_zone_id: params.hostZoneId ?? null,
    })
    .select('*')
    .single()
  if (error) {
    console.error('[orgs] createOrganization error:', error.message)
    return null
  }
  // The founder is member #1 of their own org.
  await supabase.from('organization_members').upsert(
    { org_id: data.id, user_id: user.id },
    { onConflict: 'org_id,user_id', ignoreDuplicates: true })
  logEvent('org_created', { orgId: data.id, category: params.category })
  return data
}

export async function updateOrganization(orgId: string, params: {
  name: string
  description?: string
  category: OrgCategory
  hostZoneId?: string | null
}): Promise<boolean> {
  const { error } = await supabase
    .from('organizations')
    .update({
      name: params.name.trim(),
      description: params.description?.trim() || null,
      category: params.category,
      host_zone_id: params.hostZoneId ?? null,
    })
    .eq('id', orgId)
  return !error
}

export async function fetchOrganization(orgId: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*, zones:host_zone_id(id, name)')
    .eq('id', orgId)
    .maybeSingle()
  if (error) {
    console.error('[orgs] fetchOrganization error:', error.message)
    return null
  }
  return data as Organization | null
}

// Orgs homed at a venue — the "groups that meet here" hook on the venue page.
export async function fetchOrganizationsAtVenue(zoneId: string): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('host_zone_id', zoneId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as Organization[]
}

// Orgs I own or belong to (for the profile "Organizations" screen).
export async function fetchMyOrganizations(): Promise<{ owned: Organization[]; joined: Organization[] }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { owned: [], joined: [] }

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('organizations').select('*, zones:host_zone_id(id, name)').eq('owner_id', user.id),
    supabase.from('organization_members').select('org_id').eq('user_id', user.id),
  ])

  const memberIds = (memberships ?? []).map((m: any) => m.org_id)
  let joined: Organization[] = []
  if (memberIds.length > 0) {
    const { data } = await supabase
      .from('organizations')
      .select('*, zones:host_zone_id(id, name)')
      .in('id', memberIds)
      .neq('owner_id', user.id)
    joined = (data ?? []) as Organization[]
  }
  return { owned: (owned ?? []) as Organization[], joined }
}

export async function fetchMemberCount(orgId: string): Promise<number> {
  const { data } = await supabase.rpc('org_member_count', { p_org: orgId })
  return (data as number) ?? 0
}

export async function isOrgMember(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  return !!data
}

export async function joinOrganization(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase.from('organization_members').upsert(
    { org_id: orgId, user_id: user.id },
    { onConflict: 'org_id,user_id', ignoreDuplicates: true })
  if (!error) logEvent('org_joined', { orgId })
  return !error
}

export async function leaveOrganization(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', user.id)
  return !error
}

// ── Announcements ────────────────────────────────────────────────────────────

export async function fetchOrgPosts(orgId: string): Promise<OrgPost[]> {
  const { data, error } = await supabase
    .from('organization_posts')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return []
  return (data ?? []) as OrgPost[]
}

// Owner posts an announcement; members get an in-app + push notification.
// This is the "promote and market to your members" core of the feature.
export async function postOrgAnnouncement(org: Organization, title: string, body?: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  if (!screenText(title).ok || (body && !screenText(body).ok)) return false

  const { error } = await supabase.from('organization_posts').insert({
    org_id: org.id,
    title: title.trim(),
    body: body?.trim() || null,
  })
  if (error) {
    console.error('[orgs] postOrgAnnouncement error:', error.message)
    return false
  }

  // Fan out to members (owner-gated RPC; capped to keep it beta-sane).
  try {
    const { data: memberIds } = await supabase.rpc('org_member_ids', { p_org: org.id })
    const ids = ((memberIds ?? []) as string[]).filter((id) => id !== user.id).slice(0, 500)
    await Promise.allSettled(ids.map((id) => sendNotification({
      userId: id,
      type: 'org_announcement',
      title: org.name,
      body: title.trim(),
      data: { type: 'org_announcement', org_id: org.id },
    })))
  } catch { /* non-fatal */ }

  logEvent('org_announcement', { orgId: org.id })
  return true
}

// ── Org events (they live on venue_events with an org tag) ──────────────────

export async function fetchOrgEvents(orgId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('venue_events')
    .select('*')
    .eq('org_id', orgId)
    .order('starts_at', { ascending: false })
    .limit(20)
  if (error) return []
  return data ?? []
}
