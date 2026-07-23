import { supabase } from './supabase'

export interface VenueBadge {
  id: string
  zone_id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  earned_at: string
}

// Founding tags (Jacob, Jul 2026): curated status badges, not earned by metrics.
// "First HereNow Venue" is Martha My Dear; "Founding Partner" goes to the early
// Nashville venues onboarded by hand. They live in the same zone_badges table as
// the achievement badges but are awarded via SQL (see docs), never by the
// auto-award loop below, and render distinctly (gold, pinned first).
export const FOUNDING_BADGES = {
  first_herenow_venue: {
    slug: 'first_herenow_venue',
    name: 'First HereNow Venue',
    description: 'The first venue ever on HereNow.',
    icon: 'ribbon',
  },
  founding_partner: {
    slug: 'founding_partner',
    name: 'Founding Partner',
    description: 'An early Nashville partner that helped launch HereNow.',
    icon: 'star',
  },
} as const

const FOUNDING_SLUGS: Set<string> = new Set(Object.keys(FOUNDING_BADGES))

export function isFoundingBadge(slug: string): boolean {
  return FOUNDING_SLUGS.has(slug)
}

// Founding tags first, then achievement badges — so a venue's status reads
// before its stats. Stable within each group by earned_at (fetch order).
export function sortVenueBadges(badges: VenueBadge[]): VenueBadge[] {
  return [...badges].sort((a, b) => {
    const af = isFoundingBadge(a.slug) ? 0 : 1
    const bf = isFoundingBadge(b.slug) ? 0 : 1
    return af - bf
  })
}

const BADGE_DEFS: {
  slug: string
  name: string
  description: string
  icon: string
  check: (zoneId: string) => Promise<boolean>
}[] = [
  {
    slug: 'venue_first_100',
    name: 'First 100',
    description: '100 check-ins and counting.',
    icon: 'flame',
    check: async (zoneId) => {
      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('zone_id', zoneId)
      return (count ?? 0) >= 100
    },
  },
  {
    slug: 'venue_connection_hub',
    name: 'Connection Hub',
    description: '50+ real connections forged here.',
    icon: 'hand-left',
    check: async (zoneId) => {
      const { count } = await supabase
        .from('we_met')
        .select('*', { count: 'exact', head: true })
        .eq('zone_id', zoneId)
        .eq('status', 'confirmed')
      return (count ?? 0) >= 50
    },
  },
  {
    slug: 'venue_event_host',
    name: 'Event Host',
    description: 'This venue has run community events.',
    icon: 'sparkles',
    check: async (zoneId) => {
      const { count } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('zone_id', zoneId)
      return (count ?? 0) >= 1
    },
  },
  {
    slug: 'venue_community_fav',
    name: 'Community Fav',
    description: 'Members keep coming back.',
    icon: 'star',
    check: async (zoneId) => {
      const { data } = await supabase
        .from('sessions')
        .select('user_id')
        .eq('zone_id', zoneId)
      if (!data || data.length === 0) return false
      const counts: Record<string, number> = {}
      data.forEach((s: any) => {
        counts[s.user_id] = (counts[s.user_id] ?? 0) + 1
      })
      const regulars = Object.values(counts).filter((c) => c >= 3).length
      return regulars >= 5
    },
  },
  {
    slug: 'venue_the_spot',
    name: 'The Spot',
    description: 'This place gets packed.',
    icon: 'flame',
    check: async (zoneId) => {
      const { data } = await supabase
        .from('sessions')
        .select('checked_in_at')
        .eq('zone_id', zoneId)
      if (!data || data.length < 15) return false
      const byDay: Record<string, number> = {}
      data.forEach((s: any) => {
        const day = new Date(s.checked_in_at).toDateString()
        byDay[day] = (byDay[day] ?? 0) + 1
      })
      return Object.values(byDay).some((c) => c >= 15)
    },
  },
]

export async function fetchVenueBadges(zoneId: string): Promise<VenueBadge[]> {
  const { data, error } = await supabase
    .from('zone_badges')
    .select('*')
    .eq('zone_id', zoneId)
    .order('earned_at', { ascending: true })

  if (error) {
    console.error('[venueBadges] fetch error:', error.message)
    return []
  }
  return data ?? []
}

export async function checkAndAwardVenueBadges(zoneId: string): Promise<VenueBadge[]> {
  const existing = await fetchVenueBadges(zoneId)
  const existingSlugs = new Set(existing.map((b) => b.slug))
  let awarded = false

  for (const def of BADGE_DEFS) {
    if (existingSlugs.has(def.slug)) continue
    try {
      const earned = await def.check(zoneId)
      if (!earned) continue
      await supabase.from('zone_badges').upsert(
        {
          zone_id:     zoneId,
          slug:        def.slug,
          name:        def.name,
          description: def.description,
          icon:        def.icon,
        },
        { onConflict: 'zone_id,slug' }
      )
      awarded = true
    } catch (e) {
      console.warn(`[venueBadges] check failed for ${def.slug}:`, e)
    }
  }

  return awarded ? fetchVenueBadges(zoneId) : existing
}
