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

// The worst accuracy (metres) this venue shape will accept for a check-in.
export function checkinAccuracyCeiling(hasPolygon: boolean): number {
  return hasPolygon ? POLYGON_MAX_CHECKIN_ACCURACY_M : CIRCLE_SOFT_CHECKIN_ACCURACY_M
}

// True when a fix is precise enough to be allowed to decide a check-in at this
// venue. A null accuracy (platform didn't report one) is treated as acceptable
// here and handled by the caller's other gates — this function is only about a
// reported value being too fuzzy to mean anything.
export function fixPreciseEnoughForCheckin(accuracy: number | null, hasPolygon: boolean): boolean {
  if (accuracy == null) return true
  return accuracy <= checkinAccuracyCeiling(hasPolygon)
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
