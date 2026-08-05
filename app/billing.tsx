import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'

// Stripe Checkout returns the user here (create-checkout sets success_url =
// /billing?status=success). Without this route the redirect 404'd even though
// the payment went through. The webhook grants the actual entitlement; this page
// just confirms and sends the user back into the app.
export default function BillingScreen() {
  const insets = useSafeAreaInsets()
  const { status } = useLocalSearchParams<{ status?: string }>()
  const cancelled = status === 'cancelled'

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.center}>
        <View style={[styles.iconWrap, cancelled && styles.iconWrapMuted]}>
          <Ionicons
            name={cancelled ? 'close' : 'checkmark'}
            size={40}
            color={cancelled ? '#7A93AC' : '#22c55e'}
          />
        </View>

        <Text style={styles.title}>{cancelled ? 'Checkout cancelled' : "You're all set"}</Text>
        <Text style={styles.sub}>
          {cancelled
            ? 'No charge was made. You can pick a plan whenever you like.'
            : 'Your subscription is active. It can take a few seconds to show up across the app.'}
        </Text>

        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace(cancelled ? ('/pricing' as any) : '/(tabs)')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>{cancelled ? 'Back to plans' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16, maxWidth: 440, width: '100%', alignSelf: 'center' },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#22c55e15',
    borderWidth: 1, borderColor: '#22c55e40', alignItems: 'center', justifyContent: 'center',
  },
  iconWrapMuted: { backgroundColor: '#0D1B2E', borderColor: '#1A2E4A' },
  title: { fontSize: 26, fontWeight: '900', color: '#f8fafc', textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 15, color: '#7A93AC', textAlign: 'center', lineHeight: 22 },
  btn: {
    marginTop: 16, backgroundColor: '#29B6F6', borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center',
  },
  btnText: { color: '#050A15', fontWeight: '800', fontSize: 16 },
})
