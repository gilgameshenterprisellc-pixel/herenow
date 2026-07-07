import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

// Fire-and-forget success buzz for rewarding moments (check-in, We Met).
// No-op on web; never throws.
export function successBuzz() {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}
