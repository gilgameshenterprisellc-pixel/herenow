// Pure presence-decision logic for HereNow's geofence eviction path.
//
// This is deliberately free of React and Supabase so it can be unit-tested
// against simulated GPS traces (see test/). The app (SessionContext +
// sessions.ts) imports these exact functions, so the tests cover the real
// decision logic — not a throwaway re-implementation.
//
// The whole point of this module is to make false evictions impossible to
// reintroduce by accident: the rules for when a checked-in user gets booted
// live in one small, tested place.

export type PresenceReading = 'inside' | 'outside' | 'unknown'

// Require this many CONSECUTIVE trustworthy 'outside' reads before evicting.
// A single fix is never enough: indoor GPS glitches produce one-off outside
// reads even when the person hasn't moved, which was booting people mid-visit.
// 'inside' and 'unknown' both reset the count. At the ~3-min presence cadence,
// 2 strikes means ~6 minutes of continuous, confirmed absence.
export const EVICT_STRIKES = 2

// Maximum horizontal accuracy (metres, ~95% confidence) we will trust for a
// presence verdict. A fuzzier fix is 'unknown'. This is the SAME bar used at
// check-in on purpose: we never kick someone out on a fix we would not have
// let them in with.
export const MAX_PRESENCE_ACCURACY_M = 60

// Fold one presence reading into the running strike count.
//   'inside'  -> clearly here: reset to 0.
//   'unknown' -> we do not trust the fix (bad accuracy, no fix, or the RPC
//                couldn't decide): reset and wait for a better read. NEVER evict.
//   'outside' -> trustworthy, confirmed out: +1 strike; evict at EVICT_STRIKES.
// On eviction the count resets so a later re-check-in starts clean.
export function applyPresenceReading(
  strikes: number,
  reading: PresenceReading,
): { strikes: number; evict: boolean } {
  if (reading === 'inside' || reading === 'unknown') return { strikes: 0, evict: false }
  const next = strikes + 1
  if (next >= EVICT_STRIKES) return { strikes: 0, evict: true }
  return { strikes: next, evict: false }
}

// Background auto-checkout rule. The OS geofence Exit event (a ~150m wake ring)
// is only a hint; the background task re-verifies with a fresh, accuracy-gated
// fix and checks the user out ONLY on a confirmed 'outside'. 'inside' and
// 'unknown' (bad fix, no fix, or RPC error) must never end a session in the
// background — the foreground verifier and the server staleness net handle a
// genuine departure. Named + tested so this can't regress into evicting on
// 'unknown'. Note this is a single confirmed read (no strike count): it already
// requires the OS to have fired Exit on the 150m ring first.
export function shouldBackgroundCheckout(reading: PresenceReading): boolean {
  return reading === 'outside'
}

// Map a raw location outcome to a presence reading. Pure and total, so every
// branch of the "should we trust this?" gate is testable:
//   fix === null              -> 'unknown' (no fix at all)
//   accuracy missing/too fuzzy -> 'unknown' (don't trust it)
//   inZone === null            -> 'unknown' (RPC errored — cannot decide, so
//                                 never treat it as 'outside' / grounds to evict)
//   inZone === true            -> 'inside'
//   inZone === false           -> 'outside'
export function presenceFromFix(
  fix: { accuracy: number | null } | null,
  inZone: boolean | null,
  maxAccuracyM: number = MAX_PRESENCE_ACCURACY_M,
): PresenceReading {
  if (!fix) return 'unknown'
  if (fix.accuracy == null || fix.accuracy > maxAccuracyM) return 'unknown'
  if (inZone == null) return 'unknown'
  return inZone ? 'inside' : 'outside'
}
