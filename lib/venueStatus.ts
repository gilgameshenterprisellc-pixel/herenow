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
 * Concurrent check-ins that make a venue read as "busy" rather than just open.
 *
 * Low on purpose. During the pilot a handful of people in a room IS the night
 * happening, and a threshold tuned for a packed bar would mean nobody ever sees
 * purple. Revisit once there is real traffic to calibrate against.
 */
export const BUSY_THRESHOLD = 3

export const STATUS_STYLE: Record<VenueStatus, { color: string; label: string }> = {
  busy:   { color: '#a855f7', label: 'Active' },
  open:   { color: '#22c55e', label: 'Live' },
  nearby: { color: '#29B6F6', label: 'Nearby' },
}

export const SUBSCRIBED_COLOR = '#f59e0b'

export function venueStatus(zone: Zone, now: Date = new Date()): VenueStatus {
  const here = zone.member_count ?? 0
  if (here >= BUSY_THRESHOLD) return 'busy'

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
