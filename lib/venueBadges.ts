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
    criteria: 'Awarded once, by hand. There can only ever be one.',
  },
  founding_partner: {
    slug: 'founding_partner',
    name: 'Founding Partner',
    description: 'An early Nashville partner that helped launch HereNow.',
    icon: 'star',
    criteria: 'Given to the venues who backed HereNow before it had a crowd.',
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
  criteria: string
  check: (zoneId: string) => Promise<boolean>
}[] = [
  {
    slug: 'venue_first_100',
    name: 'First 100',
    description: '100 check-ins and counting.',
    icon: 'flame',
    criteria: '100 total check-ins at this venue.',
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
    criteria: '50 We Met connections confirmed here.',
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
    criteria: 'Hosted at least one community event.',
    check: async (zoneId) => {
      // The table is venue_events. There is no `events` table and never was, so
      // this check errored on every run and Event Host could not be earned by
      // any venue, however many events it had actually hosted.
      const { count, error } = await supabase
        .from('venue_events')
        .select('*', { count: 'exact', head: true })
        .eq('zone_id', zoneId)
      if (error) {
        console.warn('[venueBadges] event_host check error:', error.message)
        return false
      }
      return (count ?? 0) >= 1
    },
  },
  {
    slug: 'venue_community_fav',
    name: 'Community Fav',
    description: 'Members keep coming back.',
    icon: 'star',
    criteria: 'At least 5 people have checked in 3 or more times.',
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
    criteria: '15 or more check-ins in a single day.',
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

// A badge's icon is defined in code (above), keyed by slug — that's the source of
// truth. The zone_badges.icon column can drift: a hand-seeded row once stored an
// invalid Ionicons name ('fire' instead of 'flame') and rendered as a "?". The UI
// resolves the icon by slug first and only falls back to the stored value, so a
// bad column value can never surface a broken glyph again.
export const BADGE_ICON_BY_SLUG: Record<string, string> = {
  ...Object.fromEntries(Object.values(FOUNDING_BADGES).map((b) => [b.slug, b.icon] as [string, string])),
  ...Object.fromEntries(BADGE_DEFS.map((d) => [d.slug, d.icon] as [string, string])),
}

// What a badge means and how it was earned, for the tap-to-explain sheet
// (Jacob: "makes the badges feel more meaningful rather than just decorative").
// Same rule as the icons above — code is the source of truth, because the
// zone_badges row was written whenever the badge was awarded and its copy can
// be older than what's here.
export interface BadgeInfo { name: string; description: string; criteria: string }

export const BADGE_INFO_BY_SLUG: Record<string, BadgeInfo> = {
  ...Object.fromEntries(
    Object.values(FOUNDING_BADGES).map((b) =>
      [b.slug, { name: b.name, description: b.description, criteria: b.criteria }] as [string, BadgeInfo]
    )
  ),
  ...Object.fromEntries(
    BADGE_DEFS.map((d) =>
      [d.slug, { name: d.name, description: d.description, criteria: d.criteria }] as [string, BadgeInfo]
    )
  ),
}

/**
 * Resolve what to show for a badge, preferring code over the stored row and
 * degrading gracefully for a slug we no longer define (a badge awarded by an
 * older build must still open something readable rather than an empty sheet).
 */
export function badgeInfo(badge: VenueBadge): BadgeInfo {
  const known = BADGE_INFO_BY_SLUG[badge.slug]
  if (known) return known
  return {
    name: badge.name,
    description: badge.description ?? '',
    criteria: 'Earned through this venue’s activity on HereNow.',
  }
}

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
