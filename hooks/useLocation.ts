import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

interface Coords {
  latitude: number
  longitude: number
}

export function useLocation() {
  const [location, setLocation] = useState<Coords | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission denied')
        setLoading(false)
        return
      }

      // Get immediate position
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      setLoading(false)

      // Watch for updates
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
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
