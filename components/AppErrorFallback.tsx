import { useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Sentry from '@sentry/react-native'

interface Props {
  error: Error
  retry: () => void | Promise<void>
}

// Recoverable fallback for the Expo Router error boundaries (root layout + venue
// screen). Before this existed there was no error boundary anywhere in the app,
// so any uncaught render error tore down the whole JS tree and left a permanent
// black screen that only a force-quit fixed (Jacob, Jul 2026 check-in test: "it
// goes to a black screen still and you have to close out of the app and reopen
// it"). Now a crash becomes a card you can recover from.
//
// Note: once a router ErrorBoundary catches an error, it is no longer "uncaught",
// so Sentry's global handler does not fire for it. We report it explicitly here
// (tagged) so these still show up in Sentry with the real stack.
export default function AppErrorFallback({ error, retry }: Props) {
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (Platform.OS !== 'web') {
      try { Sentry.captureException(error, { tags: { boundary: 'app' } }) } catch {}
    }
    console.error('[AppErrorFallback]', error)
  }, [error])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <Ionicons name="alert-circle" size={44} color="#f97316" style={styles.icon} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.sub}>
        This screen hit a snag. If you just checked in you are still checked in — this is only the display.
      </Text>

      {!!error?.message && (
        <View style={styles.detail}>
          <Text style={styles.detailText} numberOfLines={5}>{error.message}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={() => retry()} activeOpacity={0.85}>
        <Text style={styles.primaryText}>Try again</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => { try { router.replace('/(tabs)/' as any) } catch {} }}
        activeOpacity={0.7}
      >
        <Text style={styles.secondaryText}>Back to the map</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050A15',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  icon: { marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: '#f8fafc', textAlign: 'center' },
  sub: { fontSize: 14, color: '#7A93AC', textAlign: 'center', lineHeight: 20 },
  detail: {
    backgroundColor: '#0D1B2E',
    borderColor: '#1A2E4A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    width: '100%',
  },
  detailText: {
    fontSize: 12,
    color: '#8EADC7',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  primaryBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 8,
  },
  primaryText: { fontSize: 16, fontWeight: '800', color: '#050A15' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
  secondaryText: { fontSize: 15, fontWeight: '600', color: '#7A93AC' },
})
