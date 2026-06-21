import { useEffect } from 'react'
import { Platform } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useGeofenceTask } from '@/hooks/useGeofenceTask'
import { SessionProvider } from '@/contexts/SessionContext'
import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/push'

export default function RootLayout() {
  useGeofenceTask()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return

      // Register for push notifications on every sign-in (idempotent — just updates the token)
      registerPushToken()

      if (Platform.OS !== 'web') return

      // Web-only: restore pending profile created during email confirmation flow
      const raw = localStorage.getItem('herenow_pending_profile')
      if (!raw) return

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!existing) {
        try {
          const { displayName, username, isVenueOwner } = JSON.parse(raw)
          await supabase.from('profiles').insert({
            id:             session.user.id,
            display_name:   displayName,
            username,
            is_venue_owner: isVenueOwner ?? false,
          })
        } catch {}
      }

      localStorage.removeItem('herenow_pending_profile')
      router.replace('/profile/edit')
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="zone/[id]" />
        <Stack.Screen name="zone/create" />
        <Stack.Screen name="zone/event/create" />
        <Stack.Screen name="check-in/[zoneId]" />
        <Stack.Screen name="afterglow/[sessionId]" />
        <Stack.Screen name="we-met" />
        <Stack.Screen name="messages/index" />
        <Stack.Screen name="messages/[wemetId]" />
        <Stack.Screen name="badges" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="venue/dashboard" />
        <Stack.Screen name="venue/edit" />
      </Stack>
    </SessionProvider>
  )
}
