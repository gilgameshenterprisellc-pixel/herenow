import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'

interface Coords {
  latitude: number
  longitude: number
}

export function useLocation() {
  const [location, setLocation] = useState<Coords | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // False only when the OS will not show the permission prompt again, which is
  // the case on iOS after a single denial. The caller uses this to offer
  // Settings instead of a retry that cannot do anything.
  const [canAskAgain, setCanAskAgain] = useState(true)
  // Bumping this re-runs the effect. Without it the effect's [] deps meant a
  // denied permission was permanent for the life of the mounted screen, and
  // because Expo Router keeps tab screens mounted, switching tabs and coming
  // back did not re-run it either. There was no way back short of restarting
  // the app.
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setError(null)
    setLoading(true)
    setAttempt(n => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    if (Platform.OS === 'web') {
      if (!navigator.geolocation) {
        setError('Geolocation not supported in this browser')
        setLoading(false)
        return
      }
      // watchPosition mirrors native watchPositionAsync — updates as user moves
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return
          setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
          setError(null)
          setLoading(false)
        },
        (err) => {
          if (cancelled) return
          // A browser-level denial is sticky: retrying will fail the same way
          // until the user changes it in site settings. Say so rather than
          // offering a button that quietly does nothing.
          setCanAskAgain(err.code !== err.PERMISSION_DENIED)
          setError(err.message)
          setLoading(false)
        },
        { enableHighAccuracy: true, maximumAge: 10_000 }
      )
      return () => { cancelled = true; navigator.geolocation.clearWatch(watchId) }
    }

    // Native: use expo-location
    const Location = require('expo-location')
    let sub: any = null

    const start = async () => {
      const { status, canAskAgain: mayAsk } = await Location.requestForegroundPermissionsAsync()
      if (cancelled) return
      if (status !== 'granted') {
        setCanAskAgain(mayAsk !== false)
        setError('Location permission denied')
        setLoading(false)
        return
      }
      setCanAskAgain(true)

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      if (cancelled) return
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      setLoading(false)

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (pos: any) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      )
    }

    start().catch((err) => {
      if (cancelled) return
      setError(err.message)
      setLoading(false)
    })

    return () => { cancelled = true; sub?.remove() }
  }, [attempt])

  return { location, loading, error, retry, canAskAgain }
}
