import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useGeofenceTask } from '@/hooks/useGeofenceTask'
import { SessionProvider } from '@/contexts/SessionContext'

export default function RootLayout() {
  useGeofenceTask()

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
