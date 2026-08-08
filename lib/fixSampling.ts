// Turning a burst of GPS readings into one position we're willing to act on.
//
// Kept pure and free of React Native / expo-location so it can be unit-tested
// against the geo-model simulator (test/fix-sampling.test.ts). lib/location.ts
// is the only caller; it owns the platform plumbing and nothing else.
//
// The problem this solves: a reported accuracy is a RADIUS, not a point. A phone
// standing in the middle of Martha My Dear (~29m x 16m) and reporting 25m
// accuracy lands its reported position outside the footprint about half the
// time. That made check-in from the centre of the room a coin flip — and made
// force-quitting the app "sometimes work", because each retry was a fresh flip.
// Taking the median of several readings shrinks that scatter without touching
// the geofence, which is the only lever that helps the patron inside without
// also helping the car parked out front.

export interface RawFix {
  latitude: number
  longitude: number
  accuracy: number | null
}

export interface SummarizedFix {
  latitude: number
  longitude: number
  accuracy: number | null
  samples: number
}

// How many readings we want to median together. Five is where the simulated
// gain flattens out; more just makes check-in feel slow.
export const SAMPLE_TARGET = 5

// A reading this tight is trustworthy enough that we don't need a crowd to
// corroborate it — two of them is plenty, so open-air check-in stays quick.
export const EXCELLENT_ACCURACY_M = 10

// Readings this much worse than the best one we've seen are the coarse
// cell/wifi estimates a phone emits before GPS converges. They are not noise
// around the true position, they are a different (much worse) sensor, so they
// are dropped rather than averaged in — otherwise they drag the median toward
// the cell tower.
function usableFixes(fixes: RawFix[]): RawFix[] {
  const reported = fixes.map((f) => f.accuracy).filter((a): a is number => a != null)
  if (reported.length === 0) return fixes
  const best = Math.min(...reported)
  // Additive slack as well as multiplicative, so a very tight best fix (2m)
  // doesn't reject a perfectly good 6m one.
  const cutoff = Math.max(best * 2, best + 5)
  return fixes.filter((f) => f.accuracy == null || f.accuracy <= cutoff)
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Should the sampler stop early, or keep watching until the caller's timeout?
//
// `targetAccuracyM` is what we'd LIKE. `actionableAccuracyM` is what the caller
// will actually accept from a full crowd of readings — once we have the crowd
// and we're already inside that, more waiting cannot change the decision, so
// making the user hold their phone for the rest of the window is pure cost.
// Without this, a phone reporting a steady 20m indoors would sit out the whole
// 15s even though its answer was settled after 5 seconds.
export function enoughSamples(
  fixes: RawFix[],
  targetAccuracyM: number,
  actionableAccuracyM = targetAccuracyM,
): boolean {
  const usable = usableFixes(fixes).slice(-SAMPLE_TARGET)
  if (usable.length === 0) return false
  const acc = median(usable.map((f) => f.accuracy ?? Infinity))
  // A couple of very tight readings agree well enough to stop on.
  if (usable.length >= 2 && acc <= EXCELLENT_ACCURACY_M) return true
  if (usable.length < SAMPLE_TARGET) return false
  return acc <= Math.max(targetAccuracyM, actionableAccuracyM)
}

// Collapse a burst of readings into the position we'll actually test against
// the fence.
//
// The median is taken over the MOST RECENT usable readings, not all of them, for
// two reasons: the phone is still converging early in the window, and someone
// who walks in from the lot while the sampler runs should be judged on where
// they ended up, not on the midpoint of their walk.
//
// Reported accuracy is the median of the retained readings rather than the best
// one. The best-of is a flattering number and the gate downstream reads it as
// "how much should I trust this" — it should describe the typical reading, not
// the luckiest.
export function summarizeFixes(fixes: RawFix[]): SummarizedFix | null {
  if (fixes.length === 0) return null
  const recent = usableFixes(fixes).slice(-SAMPLE_TARGET)
  if (recent.length === 0) return null

  const reported = recent.map((f) => f.accuracy).filter((a): a is number => a != null)
  return {
    latitude:  median(recent.map((f) => f.latitude)),
    longitude: median(recent.map((f) => f.longitude)),
    accuracy:  reported.length > 0 ? median(reported) : null,
    samples:   recent.length,
  }
}
