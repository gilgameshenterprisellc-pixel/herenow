import { useEffect } from 'react'
import { Platform } from 'react-native'
import { router } from 'expo-router'

// Routes the user to the right screen when they tap a push/local notification —
// including from the lock screen or a cold app launch. Without this, tapping
// "Someone sent you a We Met" just opens the app to wherever it was last.
// Native only; web notifications are handled by the browser/service worker.
export function useNotificationTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return

    let sub: { remove: () => void } | undefined

    ;(async () => {
      const Notifications = await import('expo-notifications')

      const route = (data: Record<string, any> | undefined) => {
        if (!data) return
        // Message notifications carry a we_met_id and open the thread.
        // We Met request/confirm open the confirmation screen.
        if (data.type === 'message' && data.we_met_id) {
          router.push(`/messages/${data.we_met_id}` as any)
        } else if (data.route === 'circle') {
          router.push('/circle' as any)
        } else if (data.we_met_id) {
          router.push('/we-met' as any)
        } else if (data.zone_id) {
          router.push(`/zone/${data.zone_id}` as any)
        }
      }

      // Cold start: app was launched by tapping a notification
      const last = await Notifications.getLastNotificationResponseAsync()
      if (last) {
        route(last.notification.request.content.data as Record<string, any>)
      }

      // Warm taps while the app is running/backgrounded
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        route(response.notification.request.content.data as Record<string, any>)
      })
    })()

    return () => sub?.remove()
  }, [])
}
