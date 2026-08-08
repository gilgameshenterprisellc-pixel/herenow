// Pure geofence tuning math — the dials that decide how far past a venue's
// boundary a GPS fix can sit and still count. Kept free of React/Supabase so the
// "can you check in from the street?" question is unit-testable against the
// geo-model simulator (see test/geofence-checkin.test.ts). lib/sessions.ts imports
// these exact values, so the tests cover what the app actually does.

// How much the fix's own horizontal uncertainty is allowed to widen the fence.
// A patron inside whose GPS center drifts past the boundary should still get in,
// so we grow the fence by (a capped slice of) the reported accuracy. Too big a
// cap is exactly what let people check in from ~50 ft out at Martha, so the cap
// is split by venue shape and by direction (tight in, loose out):
//
//   • Polygon check-in: SMALL. The footprint already covers the whole interior,
//     so an inside patron's center is inside (passes at 0) — the cushion only
//     absorbs small drift and must not reach the street.
//   • Circle check-in: GENEROUS. No real shape, and old iPhones bottom out at
//     60–90m indoors; too tight and real patrons can't get in.
//   • Presence/eviction: GENEROUS for both — you get breathing room once in, and
//     only a clearly-outside fix (well past this) ever strikes toward eviction.
export const CHECKIN_ACCURACY_CAP_POLYGON_M = 3
export const CHECKIN_ACCURACY_CAP_CIRCLE_M  = 35
export const PRESENCE_ACCURACY_CAP_M         = 35

// The accuracy slice actually added to a margin: clamp to [0, capM].
export function accuracyAllowanceM(accuracy: number | null, capM: number): number {
  return Math.min(Math.max(accuracy ?? 0, 0), capM)
}

// Which check-in cap applies to this venue.
export function checkinAccuracyCap(hasPolygon: boolean): number {
  return hasPolygon ? CHECKIN_ACCURACY_CAP_POLYGON_M : CHECKIN_ACCURACY_CAP_CIRCLE_M
}

// ── How precise a fix has to be before it may decide anything ─────────────────
// Separate from the cushion above. The cushion asks "how far past the boundary
// do we forgive?"; this asks "is this fix even capable of resolving this venue?"
//
// A polygon venue is small (Martha My Dear: ~29m x 16m). A fix reported at 60–90m
// accuracy describes a circle several times larger than the whole building, so
// its center falls inside the footprint from the parking lot as easily as from
// the bar. That is what let a parked car check in, and no amount of boundary
// tightening fixes it, because the imprecision is in the input. Require a fix
// materially smaller than the building, and refuse rather than guess.
//
// Circle venues keep the generous soft band: there is no footprint to resolve,
// and the radius is wide enough that a fuzzy fix is far less consequential.
export const POLYGON_MAX_CHECKIN_ACCURACY_M = 25
export const CIRCLE_SOFT_CHECKIN_ACCURACY_M = 90

// ── How many readings agree, not just how good one of them looked ────────────
// The bar above is the right one for a LONE reading. But lib/location.ts now
// returns the median of several, and a median of five 35m readings pins a
// position far better than any one 35m reading does. Holding that aggregate to
// the single-reading bar is what bounced people standing in the middle of the
// room (Jacob, build 24) — the fix was precise enough to act on, we just had no
// way to say so.
//
// So the ceiling depends on corroboration. Simulated at Martha's real footprint
// (test/fix-sampling.test.ts pins these), median of five vs one reading:
//
//   accuracy   dead centre of the room      truck parked 12m out front
//   25m        57%  ->  93%                 19%  ->   8%
//   40m         0%  ->  66%   (was hard-refused by the 25m ceiling)
//
// Allowing 40m WITH corroboration is no looser at the parking lot than today's
// 25m ceiling already is (16-18% vs 19%), and it rescues the patron inside who
// is currently refused outright. Without corroboration the old 25m bar stands.
export const POLYGON_AGGREGATED_MAX_ACCURACY_M = 40

// Below this many readings, an aggregate isn't an aggregate — hold it to the
// single-reading bar.
export const MIN_SAMPLES_FOR_AGGREGATED_CEILING = 3

// What the sampler should CHASE, which is not the same as what we'll accept.
// Aiming at the ceiling makes the sampler stop the moment it scrapes past it;
// aiming here keeps it working for a genuinely good fix for the whole window
// and only falls back on the aggregate when the building won't give one up.
export const POLYGON_TARGET_ACCURACY_M = 15

// The worst accuracy (metres) this venue shape will accept for a check-in,
// given how many readings were combined into the position.
export function checkinAccuracyCeiling(hasPolygon: boolean, samples = 1): number {
  if (!hasPolygon) return CIRCLE_SOFT_CHECKIN_ACCURACY_M
  return samples >= MIN_SAMPLES_FOR_AGGREGATED_CEILING
    ? POLYGON_AGGREGATED_MAX_ACCURACY_M
    : POLYGON_MAX_CHECKIN_ACCURACY_M
}

// True when a fix is precise enough to be allowed to decide a check-in at this
// venue. A null accuracy (platform didn't report one) is treated as acceptable
// here and handled by the caller's other gates — this function is only about a
// reported value being too fuzzy to mean anything.
export function fixPreciseEnoughForCheckin(
  accuracy: number | null,
  hasPolygon: boolean,
  samples = 1,
): boolean {
  if (accuracy == null) return true
  return accuracy <= checkinAccuracyCeiling(hasPolygon, samples)
}

// Effective margin passed to user_in_zone() for a CHECK-IN attempt: the venue's
// base check-in margin plus the (shape-aware, capped) accuracy cushion.
export function effectiveCheckinMargin(baseMargin: number, hasPolygon: boolean, accuracy: number | null): number {
  return baseMargin + accuracyAllowanceM(accuracy, checkinAccuracyCap(hasPolygon))
}

// Effective margin for a PRESENCE re-verify (eviction side): base presence margin
// plus the generous accuracy cushion, regardless of venue shape.
export function effectivePresenceMargin(baseMargin: number, accuracy: number | null): number {
  return baseMargin + accuracyAllowanceM(accuracy, PRESENCE_ACCURACY_CAP_M)
}
