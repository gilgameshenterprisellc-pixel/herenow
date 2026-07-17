import { Platform } from 'react-native'

interface Coords {
  latitude: number
  longitude: number
  // Estimated horizontal accuracy in meters (95% confidence). May be null when
  // the platform can't report it. Used to reject fuzzy fixes at check-in.
  accuracy: number | null
}

// Multi-sample position fetch — watches the GPS for up to `timeoutMs`,
// resolving early the moment a fix at or under `targetAccuracyM` arrives,
// otherwise returning the most accurate fix seen in the window.
//
// Why this exists: a single-shot read is biased against older iPhones. Their
// first fix indoors is usually a coarse cell/wifi estimate (100m+) that only
// converges to GPS precision after a few seconds of continuous watching —
// which is exactly why phones that were physically inside the venue kept
// failing the check-in accuracy gate at the July venue test while newer
// dual-frequency-GPS phones sailed through.
export async function getBestCoords(targetAccuracyM: number, timeoutMs = 15_000): Promise<Coords | null> {
  if (Platform.OS === 'web') {
    if (!navigator.geolocation) return null
    return new Promise((resolve) => {
      let best: Coords | null = null
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        navigator.geolocation.clearWatch(watchId)
        clearTimeout(timer)
        resolve(best)
      }
      const timer = setTimeout(finish, timeoutMs)
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const fix: Coords = {
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy:  pos.coords.accuracy ?? null,
          }
          if (best == null || (fix.accuracy ?? Infinity) < (best.accuracy ?? Infinity)) best = fix
          if (fix.accuracy != null && fix.accuracy <= targetAccuracyM) finish()
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
    let best: Coords | null = null
    let settled = false
    let sub: { remove: () => void } | null = null
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      sub?.remove()
      resolve(best)
    }
    const timer = setTimeout(finish, timeoutMs)
    const consider = (pos: any) => {
      const fix: Coords = {
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy:  pos.coords.accuracy ?? null,
      }
      if (best == null || (fix.accuracy ?? Infinity) < (best.accuracy ?? Infinity)) best = fix
      if (fix.accuracy != null && fix.accuracy <= targetAccuracyM) finish()
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
    }
  } catch {
    return null
  }
}
