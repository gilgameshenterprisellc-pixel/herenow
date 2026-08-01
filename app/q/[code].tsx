import { useEffect } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'

// Where a scan sends people AFTER we log it. During the TestFlight pilot set this
// to the public TestFlight invite link or a simple landing page; once the app is
// live, the App Store / Play Store listing. One-line change, no schema impact.
const SCAN_DESTINATION = 'https://herenowsocial.com'

// Public QR landing (web). A physical QR encodes {web-origin}/q/<code>; scanning
// opens this in the phone browser BEFORE the app is installed. We log the scan
// (which venue + which placement) through the SECURITY DEFINER log_qr_scan RPC,
// stash the code for best-effort post-install attribution, then forward on. This
// is the top of Jacob's funnel — the only place a pre-install scan is captured.
export default function QrRedirect() {
  const { code } = useLocalSearchParams<{ code: string }>()

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // The /q route is a web entry point; if it's ever hit inside the app, just
      // send them home rather than leaving a dead screen.
      router.replace('/(tabs)/' as any)
      return
    }
    const run = async () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      const platform = /iphone|ipad|ipod/i.test(ua) ? 'ios' : /android/i.test(ua) ? 'android' : 'other'
      try {
        await supabase.rpc('log_qr_scan', { p_code: code, p_platform: platform, p_user_agent: ua })
      } catch {
        // Never block the redirect on a logging failure — the person still gets
        // to the app; we just miss that one scan in the data.
      }
      try { localStorage.setItem('hn_qr_code', String(code ?? '')) } catch {}
      // @ts-ignore web-only
      window.location.replace(SCAN_DESTINATION)
    }
    run()
  }, [code])

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#29B6F6" />
      <Text style={styles.text}>Taking you to HereNow…</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center', gap: 14 },
  text: { color: '#8EADC7', fontSize: 15 },
})
