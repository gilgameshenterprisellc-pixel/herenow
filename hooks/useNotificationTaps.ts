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
        if (data.type === 'board_response' && data.response_id) {
          // Board Response — a temporary pin-scoped thread, not a DM.
          router.push(`/messages/response/${data.response_id}` as any)
        } else if (data.type === 'message' && data.venue_zone_id) {
          // Venue DM — the ?u is ignored for a patron, used by the owner to open
          // the specific patron thread.
          router.push(`/messages/venue/${data.venue_zone_id}${data.from_user_id ? `?u=${data.from_user_id}` : ''}` as any)
        } else if (data.type === 'message' && data.we_met_id) {
          router.push(`/messages/${data.we_met_id}` as any)
        } else if (data.type === 'auto_checkout' && data.session_id) {
          // Proximity check-out — open the Afterglow recap for that session.
          router.push(`/afterglow/${data.session_id}` as any)
        } else if (data.type === 'afterglow_recap') {
          // Morning recap nudge — open the "Your Nights" library.
          router.push('/afterglow' as any)
        } else if (data.route === 'circle') {
          router.push('/circle' as any)
        } else if (data.type === 'org_announcement' && data.org_id) {
          // Organization announcement — open the org page.
          router.push(`/org/${data.org_id}` as any)
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
