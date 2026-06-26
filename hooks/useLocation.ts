import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

interface Coords {
  latitude: number
  longitude: number
}

export function useLocation() {
  const [location, setLocation] = useState<Coords | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (!navigator.geolocation) {
        setError('Geolocation not supported in this browser')
        setLoading(false)
        return
      }
      // watchPosition mirrors native watchPositionAsync — updates as user moves
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
          setLoading(false)
        },
        (err) => {
          setError(err.message)
          setLoading(false)
        },
        { enableHighAccuracy: true, maximumAge: 10_000 }
      )
      return () => navigator.geolocation.clearWatch(watchId)
    }

    // Native: use expo-location
    const Location = require('expo-location')
    let sub: any = null

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission denied')
        setLoading(false)
        return
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      setLoading(false)

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (pos: any) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      )
    }

    start().catch((err) => {
      setError(err.message)
      setLoading(false)
    })

    return () => { sub?.remove() }
  }, [])

  return { location, loading, error }
}
