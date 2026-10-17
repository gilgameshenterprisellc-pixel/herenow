import { useEffect } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'

// Where a scan sends people AFTER we log it. HereNow is live on the App Store
// (Oct 14, 2026), so an iPhone goes straight to the listing. There is no Play
// Store listing yet, so Android and desktop land on the website.
const APP_STORE_URL = 'https://apps.apple.com/us/app/herenow-social/id6787771014'
const WEB_URL = 'https://herenowsocial.com'

// Never hold someone on this screen because the network is slow (a bar's cell
// signal). After this long we forward them anyway and lose that one scan.
const LOG_TIMEOUT_MS = 2500

// Public QR landing (web). A physical QR encodes {web-origin}/q/<code>; scanning
// opens this in the phone browser BEFORE the app is installed. We log the scan
// (which venue + which placement) through the SECURITY DEFINER log_qr_scan RPC,
// stash the code for best-effort post-install attribution, then forward on. This
// is the top of Jacob's funnel and the only place a pre-install scan is captured:
// a QR that points straight at the App Store never reaches us and can't be counted.
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
      const log = supabase
        .rpc('log_qr_scan', { p_code: code, p_platform: platform, p_user_agent: ua })
        .then(({ error }) => { if (error) console.warn('[qr] log_qr_scan:', error.message) })
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, LOG_TIMEOUT_MS))
      // Supabase reports failures as { error }, not by throwing; the catch is for
      // the network itself. Either way the person still gets where they're going.
      await Promise.race([log, timeout]).catch(() => {})
      try { localStorage.setItem('hn_qr_code', String(code ?? '')) } catch {}
      // @ts-ignore web-only
      window.location.replace(platform === 'ios' ? APP_STORE_URL : WEB_URL)
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
