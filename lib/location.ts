import { Platform } from 'react-native'

interface Coords {
  latitude: number
  longitude: number
}

// One-shot current position fetch (not a hook) — used for point-in-time
// verification like geofence checks at check-in, distinct from useLocation's
// continuous watch used for map display.
export async function getCurrentCoords(): Promise<Coords | null> {
  if (Platform.OS === 'web') {
    if (!navigator.geolocation) return null
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
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
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
  } catch {
    return null
  }
}
