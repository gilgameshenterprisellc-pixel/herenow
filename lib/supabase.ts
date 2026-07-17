import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import { AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl: string = Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey: string = Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[HereNow] Supabase env vars not set. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // On native, persist the session across app restarts using AsyncStorage.
    // On web, the default (localStorage) handles this automatically.
    storage: Platform.OS !== 'web' ? AsyncStorage : undefined,
  },
})

// Auth gate for screens. supabase.auth.getUser() makes a network round-trip on
// every call, so any flaky moment of connectivity returned a null user and the
// calling screen kicked a perfectly logged-in person to the login page (the
// other half of "I open the app and I'm logged out"). getSession() reads the
// locally persisted session instead — no network unless the token is actually
// expired — so trust it for gating. RLS still protects every query regardless.
export async function getAuthedUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

// ── Native token refresh lifecycle (Jacob: "I open the app and I'm logged out") ──
// supabase-js runs its token refresh on a JS timer. On a phone that timer is
// suspended whenever the app is backgrounded, so coming back after the access
// token expired left refresh racing against in-flight queries — a lost race
// rotates the refresh token twice, Supabase rejects the second use, and the
// user gets silently signed out. The documented React Native pattern is to
// drive refresh off AppState explicitly: refresh eagerly the moment the app
// becomes active, and stop the timer entirely while backgrounded.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
  // App launches in the active state — start refreshing immediately.
  supabase.auth.startAutoRefresh()
}
