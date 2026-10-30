// Where a venue partnership stands, from its window and whether it was revoked.
// Pure (no Supabase) so it can be tested with node --test.

export interface PartnerWindow {
  starts_at: string
  ends_at: string
  revoked_at: string | null
}

export type PartnerStatus = 'live' | 'upcoming' | 'ended' | 'revoked'

export function partnerStatus(p: PartnerWindow, now: Date = new Date()): PartnerStatus {
  if (p.revoked_at) return 'revoked'
  const t = now.getTime()
  if (t < new Date(p.starts_at).getTime()) return 'upcoming'
  if (t > new Date(p.ends_at).getTime()) return 'ended'
  return 'live'
}

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  live: 'Live now',
  upcoming: 'Upcoming',
  ended: 'Ended',
  revoked: 'Revoked',
}

// Live first, then upcoming soonest-first, then past newest-first.
export function sortPartners<T extends PartnerWindow>(list: T[], now: Date = new Date()): T[] {
  const rank: Record<PartnerStatus, number> = { live: 0, upcoming: 1, ended: 2, revoked: 2 }
  return [...list].sort((a, b) => {
    const ra = rank[partnerStatus(a, now)]
    const rb = rank[partnerStatus(b, now)]
    if (ra !== rb) return ra - rb
    const sa = new Date(a.starts_at).getTime()
    const sb = new Date(b.starts_at).getTime()
    return ra === 1 ? sa - sb : sb - sa
  })
}

/** Checks a new grant's window before it goes to the database. */
export function partnerWindowError(startsAt: Date | null, endsAt: Date | null, now: Date = new Date()): string | null {
  if (!startsAt || !endsAt) return 'Pick when the partnership starts and ends.'
  if (endsAt.getTime() <= startsAt.getTime()) return 'The end has to be after the start.'
  if (endsAt.getTime() <= now.getTime()) return 'That window is already over.'
  return null
}
