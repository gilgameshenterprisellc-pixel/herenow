import { Platform } from 'react-native'
// The aggregation itself is pure and lives apart from the platform plumbing so
// it can be unit-tested against the geo-model simulator (test/fix-sampling.test.ts).
import { summarizeFixes, enoughSamples, type RawFix } from './fixSampling'

interface Coords {
  latitude: number
  longitude: number
  // Estimated horizontal accuracy in meters (95% confidence). May be null when
  // the platform can't report it. Used to reject fuzzy fixes at check-in.
  accuracy: number | null
  // How many readings were combined into this position. 1 means a lone reading
  // that nothing corroborates; higher means the position is a median over
  // several, which is materially better than any one of them. The check-in gate
  // uses this to decide how fuzzy a reading it is willing to act on — see
  // checkinAccuracyCeiling() in lib/geofenceTuning.ts.
  samples: number
}

// Multi-sample position fetch — watches the GPS for up to `timeoutMs` and
// returns the MEDIAN of the last few good readings rather than any single one.
//
// Why a single reading isn't enough: the reported accuracy is a radius, not a
// point. At Martha My Dear (~29m x 16m) a phone standing dead centre and
// reporting 25m accuracy puts its reported position outside the building
// roughly half the time — so check-in from the middle of the room was a coin
// flip, and closing the app and retrying "sometimes worked" because each retry
// was a fresh flip (Jacob, build 24).
//
// Taking the median of several readings cuts that scatter without touching the
// fence. Simulated against test/geo-model.ts at Martha's real footprint, median
// of 5 vs one reading at 25m accuracy: dead centre 57% -> 93%, while a truck
// parked 12m out front goes 19% -> 8%. It gets better for the patron inside AND
// stricter for the parking lot, which widening the boundary never does — at a
// 12m cushion the truck passes 49% of the time.
//
// Caveat kept honest: real GPS error is partly a persistent multipath bias that
// does not resample every second, so the field gain is smaller than the
// independent-noise model suggests. Under a pessimistic "most of the error is
// frozen bias" model the same comparison is 57% -> 73% inside and 19% -> 16%
// out front — still better on both axes, which is why this is safe to ship.
//
// The older reason for watching rather than one-shot reading still holds too:
// an old iPhone's first fix indoors is a coarse cell/wifi estimate (100m+) that
// only converges after a few seconds. Those early coarse readings are filtered
// out before the median rather than allowed to drag it toward the cell tower.
export async function getBestCoords(
  targetAccuracyM: number,
  timeoutMs = 15_000,
  // What the caller will actually accept once it has a full crowd of readings.
  // Lets the sampler stop as soon as the answer is settled instead of holding
  // the user on the spinner for the rest of the window. Defaults to the target.
  actionableAccuracyM = targetAccuracyM,
): Promise<Coords | null> {
  if (Platform.OS === 'web') {
    if (!navigator.geolocation) return null
    return new Promise((resolve) => {
      const fixes: RawFix[] = []
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        navigator.geolocation.clearWatch(watchId)
        clearTimeout(timer)
        resolve(summarizeFixes(fixes))
      }
      const timer = setTimeout(finish, timeoutMs)
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          fixes.push({
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy:  pos.coords.accuracy ?? null,
          })
          if (enoughSamples(fixes, targetAccuracyM, actionableAccuracyM)) finish()
        },
        () => finish(),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
      )
    })
  }

  const Location = require('expo-location')
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') return null

  return new Promise(async (resolve) => {
    const fixes: RawFix[] = []
    let settled = false
    let sub: { remove: () => void } | null = null
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      sub?.remove()
      resolve(summarizeFixes(fixes))
    }
    const timer = setTimeout(finish, timeoutMs)
    const consider = (pos: any) => {
      fixes.push({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy:  pos.coords.accuracy ?? null,
      })
      if (enoughSamples(fixes, targetAccuracyM, actionableAccuracyM)) finish()
    }

    try {
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        consider
      )
    } catch {
      // Watch failed to start — fall back to the one-shot read below.
    }
    if (settled) return

    // Seed with a one-shot fix in parallel so we never do worse than before —
    // on some devices the first watch callback takes several seconds.
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      if (!settled) consider(pos)
    } catch {
      // One-shot failed; the watch (if running) may still deliver fixes.
      if (!sub) finish()
    }
  })
}

// One-shot current position fetch (not a hook) — used for point-in-time
// verification like geofence checks at check-in, distinct from useLocation's
// continuous watch used for map display.
export async function getCurrentCoords(): Promise<Coords | null> {
  if (Platform.OS === 'web') {
    if (!navigator.geolocation) return null
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy ?? null,
          samples:   1, // one-shot: nothing corroborates this reading
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
      )
    })
  }

  const Location = require('expo-location')
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') return null

  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    return {
      latitude:  pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy:  pos.coords.accuracy ?? null,
      samples:   1, // one-shot: nothing corroborates this reading
    }
  } catch {
    return null
  }
}
