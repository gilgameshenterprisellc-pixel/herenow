import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Show notifications as banners when app is foregrounded — native only.
// expo-notifications has no foreground handler on web.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  true,
      shouldSetBadge:   true,
    }),
  })
}

export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return

  // Requires EAS project ID — gracefully skipped if not yet configured
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId

  if (!projectId || projectId === 'YOUR_EXPO_PROJECT_ID') {
    console.warn('[push] Run `npx eas init` in the project root to enable push tokens. In-app notifications still work.')
    return
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', user.id)
  } catch (err) {
    console.warn('[push] registerPushToken failed:', err)
  }
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .maybeSingle()

    if (!profile?.push_token) return

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to:    profile.push_token,
        title,
        body,
        data:  data ?? {},
        sound: 'default',
      }),
    })
  } catch (err) {
    console.warn('[push] sendPushToUser error:', err)
  }
}
