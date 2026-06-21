import { useEffect } from 'react'
import { Platform } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useGeofenceTask } from '@/hooks/useGeofenceTask'
import { SessionProvider } from '@/contexts/SessionContext'
import { supabase } from '@/lib/supabase'

export default function RootLayout() {
  useGeofenceTask()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return
      if (Platform.OS !== 'web') return

      // Check for a pending profile from the signup flow (set when email confirm is required)
      const raw = localStorage.getItem('herenow_pending_profile')
      if (!raw) return

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!existing) {
        try {
          const { displayName, username } = JSON.parse(raw)
          await supabase.from('profiles').insert({
            id: session.user.id,
            display_name: displayName,
            username,
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
      </Stack>
    </SessionProvider>
  )
}
