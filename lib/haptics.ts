import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

// Fire-and-forget success buzz for rewarding moments (check-in, We Met).
// No-op on web; never throws.
export function successBuzz() {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

// Light tick for small, repeatable taps (Pulse reactions). Deliberately not
// successBuzz — a success notification on every emoji tap is far too heavy for
// something you might do five times in a row.
export function tapFeedback() {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}
