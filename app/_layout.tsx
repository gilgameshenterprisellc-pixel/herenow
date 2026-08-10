import { useEffect } from 'react'
import { Platform, View, Linking } from 'react-native'
import { Stack, router } from 'expo-router'
import type { ErrorBoundaryProps } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import AppErrorFallback from '@/components/AppErrorFallback'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { useGeofenceTask } from '@/hooks/useGeofenceTask'
import { useNotificationTaps } from '@/hooks/useNotificationTaps'
import { SessionProvider } from '@/contexts/SessionContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/push'
import { consumeAuthLink, isAuthLink, scrubAuthParamsFromUrl } from '@/lib/authLinks'
import { AnalyticsProvider } from '@/components/AnalyticsProvider'
import * as Sentry from '@sentry/react-native'

// Crash + error reporting. Native only — the live web build (Vercel) is left
// untouched. This is the reporter that captures the NSException reason the
// TestFlight .ips crash files leave out, so the native TurboModule/Hermes
// teardown crash finally names its own cause. The DSN is a public client
// identifier and is safe to ship inside the app.
if (Platform.OS !== 'web') {
  Sentry.init({
    dsn: 'https://70cf53eae4f5acb10d8969e27a23a674@o4511736909791232.ingest.us.sentry.io/4511736923226112',
    enabled: !__DEV__,          // report from real builds only, not local dev
    tracesSampleRate: 0,        // crashes/errors only, no perf tracing (free tier)
    enableNativeCrashHandling: true,
  })
}

function RootLayout() {
  useGeofenceTask()
  useNotificationTaps()

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.body.style.background = '#050A15'
      document.body.style.margin = '0'
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }
    }
  }, [])

  // Consume Supabase auth email links (password reset, and any other link that
  // carries tokens). Without this the tokens arrive and are ignored: the reset
  // screen opened with no session behind it, so setting a new password always
  // failed (Jacob, Aug 2026). Runs for a cold start (getInitialURL) and for a
  // link tapped while the app is already open (the 'url' event).
  useEffect(() => {
    let cancelled = false

    const handle = async (url: string | null | undefined) => {
      if (cancelled || !isAuthLink(url)) return
      const result = await consumeAuthLink(url)
      if (cancelled) return
      if (Platform.OS === 'web') scrubAuthParamsFromUrl()
      if (result === 'recovery') {
        router.replace('/(auth)/reset-password')
      } else if (result === 'error') {
        // Expired or already-used link — let the screen say so rather than
        // presenting a password form that cannot work.
        router.replace('/(auth)/reset-password?invalid=1')
      }
    }

    if (Platform.OS === 'web') {
      handle(window.location.href)
      return () => { cancelled = true }
    }

    Linking.getInitialURL().then(handle).catch(() => {})
    const sub = Linking.addEventListener('url', ({ url }) => { handle(url) })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // PKCE recovery links don't announce themselves in the URL — this event is
      // the only reliable signal that a session came from "forgot password".
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/(auth)/reset-password')
        return
      }
      if (event !== 'SIGNED_IN' || !session?.user) return

      // Silently refresh the push token on sign-in if permission is already granted.
      // The permission prompt itself waits for the first check-in (Jacob Q29).
      registerPushToken(false)

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
            venue_status:   isVenueOwner ? 'pending' : 'none',
          })
        } catch {}
      }

      localStorage.removeItem('herenow_pending_profile')
      router.replace('/profile/edit')
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <ToastProvider>
      <View style={{ flex: 1 }}>
      <SessionProvider>
        <StatusBar style="light" />
        <AnalyticsProvider />
        {Platform.OS === 'web' && <SpeedInsights />}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="zone/[id]" />
          <Stack.Screen name="zone/create" />
          <Stack.Screen name="zone/event/create" />
          <Stack.Screen name="check-in/[zoneId]" />
          <Stack.Screen name="afterglow/[sessionId]" />
          <Stack.Screen name="afterglow/index" />
          <Stack.Screen name="we-met" />
          <Stack.Screen name="messages/index" />
          <Stack.Screen name="messages/[wemetId]" />
          <Stack.Screen name="badges" />
          <Stack.Screen name="circle" />
          <Stack.Screen name="profile/edit" />
          <Stack.Screen name="u/[id]" />
          <Stack.Screen name="venue/dashboard" />
          <Stack.Screen name="venue/edit" />
          <Stack.Screen name="venue/highlights" />
          <Stack.Screen name="venue/promotions" />
          <Stack.Screen name="venue/announcements" />
          <Stack.Screen name="venue/submit" />
          <Stack.Screen name="my-venues" />
          <Stack.Screen name="admin" />
        </Stack>
      </SessionProvider>
      </View>
    </ToastProvider>
  )
}

// Root error boundary — catches any render error a screen throws so the app
// shows a recoverable card instead of a permanent black screen. Expo Router
// picks this up automatically from the root layout's `ErrorBoundary` export.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorFallback error={error} retry={retry} />
}

// Wrap so Sentry captures render errors and attaches navigation/context to
// reports. Web passes through untouched (Sentry isn't initialized there).
export default Platform.OS === 'web' ? RootLayout : Sentry.wrap(RootLayout)
