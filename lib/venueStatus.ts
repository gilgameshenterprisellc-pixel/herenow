// What a venue pin is telling you at a glance.
//
// Jacob (Aug 12): "We already have a color key where yellow means Subscribed and
// blue means Nearby. I think we could expand that to include Green — Live: the
// venue is currently open, based on its listed hours. Purple — Active/Busy:
// there's a higher level of activity or check-ins there right now. This would
// essentially give us a lightweight version of a heat map without having to
// build an actual heat map yet."
//
// One deliberate departure from that note. A pin has ONE ring, and Subscribed is
// a fact about you while Live/Busy is a fact about the venue. If Subscribed won
// the ring, the venues you care most about would be the exact ones whose status
// you could no longer see — which defeats the point of the change. So the ring
// carries venue status and Subscribed rides along as a small amber star on the
// pin. All four signals stay readable at once. Flipping that is a one-line
// change here if Jacob would rather have the amber ring back.

import { isOpenNow } from './venueHours'
import type { Zone } from './zones'

export type VenueStatus = 'busy' | 'open' | 'nearby'

/**
 * How full a venue is, as a share of its stated capacity.
 *
 * Jacob (Aug 26): "Have venues identify their capacity at registration — busy
 * meter will work off this number. Capacity is 200, 30 people checked in, this
 * would classify the venue as busy based on percentage of members checked in,
 * not necessarily the total amount of people at the venue."
 *
 * That is the right model. Thirty people is a dead warehouse and a packed dive
 * bar, and an absolute threshold cannot tell those apart. The bands below are
 * his, verbatim.
 *
 * This is the single definition. The map pin ring, the venue header meter and
 * the bar fill all read from it, so a venue cannot say "Busy" in one place and
 * "Quiet" in another — which is exactly what happened when the header hardcoded
 * a capacity of 50 and the pin used a flat count of 3.
 */
export type CrowdBand = 'quiet' | 'lively' | 'busy' | 'very_busy' | 'packed'

/** Used when a venue has not stated its capacity yet. Matches the value the
 *  venue header silently assumed before capacity existed, so nothing shifts for
 *  venues that never fill it in. */
export const DEFAULT_CAPACITY = 50

/** Ordered low to high. `maxPct` is inclusive — Jacob's 0-5 / 6-15 / 16-30 /
 *  31-50 / 51+. */
export const CROWD_BANDS: readonly {
  band: CrowdBand; maxPct: number; label: string; color: string
}[] = [
  { band: 'quiet',     maxPct: 5,        label: 'Quiet',     color: '#3b82f6' },
  { band: 'lively',    maxPct: 15,       label: 'Lively',    color: '#22c55e' },
  { band: 'busy',      maxPct: 30,       label: 'Busy',      color: '#29B6F6' },
  { band: 'very_busy', maxPct: 50,       label: 'Very Busy', color: '#f97316' },
  { band: 'packed',    maxPct: Infinity, label: 'Packed',    color: '#ef4444' },
] as const

export function crowdBand(count: number, capacity?: number | null) {
  // A zero or negative capacity would divide badly; treat it as unstated.
  const cap = capacity && capacity > 0 ? capacity : DEFAULT_CAPACITY
  const pct = (count / cap) * 100
  const entry = CROWD_BANDS.find(b => pct <= b.maxPct) ?? CROWD_BANDS[CROWD_BANDS.length - 1]
  // Fill is clamped so an over-capacity venue does not overflow the bar.
  return { ...entry, pct, fillPct: Math.min(Math.round(pct), 100) }
}

export const STATUS_STYLE: Record<VenueStatus, { color: string; label: string }> = {
  busy:   { color: '#a855f7', label: 'Active' },
  open:   { color: '#22c55e', label: 'Live' },
  nearby: { color: '#29B6F6', label: 'Nearby' },
}

export const SUBSCRIBED_COLOR = '#f59e0b'

export function venueStatus(zone: Zone, now: Date = new Date()): VenueStatus {
  const here = zone.member_count ?? 0

  // Busy and above light the pin purple, so the ring agrees with the label in
  // the venue header rather than being computed a second, different way.
  const { band } = crowdBand(here, zone.capacity)
  if (here > 0 && (band === 'busy' || band === 'very_busy' || band === 'packed')) return 'busy'

  // A temporarily closed venue is never Live, whatever its listed hours say —
  // the owner has explicitly overridden them.
  if (zone.is_temporarily_closed) return 'nearby'

  // People are physically checked in, so it is open regardless of what the
  // listed hours claim. Hours get typed once and go stale; presence does not.
  if (here > 0) return 'open'

  // isOpenNow returns null when hours are missing or unparseable. Unknown must
  // fall through to Nearby, never render as closed.
  return isOpenNow(zone.opening_hours) === true ? 'open' : 'nearby'
}
