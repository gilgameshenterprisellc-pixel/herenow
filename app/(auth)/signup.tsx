import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated, ScrollView,
} from 'react-native'
import { Image } from 'react-native'
import { Link, router } from 'expo-router'
import Reanimated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated'
import { supabase } from '@/lib/supabase'

type Mode = 'person' | 'venue'

const VENUE_TYPES = ['Bar', 'Restaurant', 'Coffee Shop', 'Venue / Event Space', 'Gym', 'Other']

export default function SignupScreen() {
  const [mode, setMode]               = useState<Mode>('person')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername]       = useState('')
  const [venueName, setVenueName]     = useState('')
  const [venueType, setVenueType]     = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [loading, setLoading]         = useState(false)

  const pillAnim = useRef(new Animated.Value(0)).current
  const btnScale = useRef(new Animated.Value(1)).current

  const switchMode = (m: Mode) => {
    setMode(m)
    Animated.spring(pillAnim, {
      toValue: m === 'person' ? 0 : 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
    }).start()
  }

  const onPressIn  = () => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true, damping: 14 }).start()
  const onPressOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, damping: 14 }).start()

  const cleanUsername = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9_]/g, '')

  const handleSignup = async () => {
    if (!email || !password) { Alert.alert('Missing fields', 'Email and password are required.'); return }
    if (mode === 'person' && !displayName) { Alert.alert('Missing fields', 'Enter a display name.'); return }
    if (mode === 'person' && cleanUsername(username).length < 3) {
      Alert.alert('Username too short', 'Username must be at least 3 characters.')
      return
    }
    if (mode === 'venue' && !venueName) { Alert.alert('Missing fields', 'Enter your venue name.'); return }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error || !data.user) {
      setLoading(false)
      Alert.alert('Signup failed', error?.message ?? 'Unknown error')
      return
    }

    if (!data.session) {
      // Email confirm is ON — shouldn't happen for this beta but handle gracefully
      setLoading(false)
      Alert.alert('Check your email', 'Click the confirmation link to activate your account, then sign in.')
      return
    }

    if (mode === 'person') {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        display_name: displayName.trim(),
        username: cleanUsername(username),
        is_venue_owner: false,
      })
      setLoading(false)
      if (profileError) { Alert.alert('Error', profileError.message); return }
      router.replace('/profile/edit')
    } else {
      // Venue signup — create profile + zone in one shot
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        display_name: displayName.trim() || venueName.trim(),
        username: cleanUsername(venueName).slice(0, 24) || `venue_${data.user.id.slice(0, 6)}`,
        is_venue_owner: true,
      })
      if (profileError) { setLoading(false); Alert.alert('Error', profileError.message); return }

      const { error: zoneError } = await supabase.from('zones').insert({
        name: venueName.trim(),
        type: venueType || 'Other',
        owner_id: data.user.id,
        lat: 0,
        lng: 0,
      })

      setLoading(false)
      if (zoneError) { Alert.alert('Zone error', zoneError.message); return }
      router.replace('/venue/dashboard' as any)
    }
  }

  const pillTranslateX = pillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 150],
  })

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Ambient glow blobs */}
      <View style={[styles.glow, styles.glowCyan]} />
      <View style={[styles.glow, styles.glowPurple]} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <Reanimated.View entering={ZoomIn.springify().damping(14)}>
            <Image source={require('@/assets/logo.webp')} style={styles.logo} resizeMode="contain" />
          </Reanimated.View>

          <Reanimated.Text entering={FadeInDown.delay(80).springify().damping(16)} style={styles.title}>
            {mode === 'venue' ? 'List Your Venue' : 'Join HereNow'}
          </Reanimated.Text>
          <Reanimated.Text entering={FadeInDown.delay(140).springify().damping(16)} style={styles.subtitle}>
            {mode === 'venue' ? 'See who\'s in the room in real time.' : 'Be present. Connect locally.'}
          </Reanimated.Text>

          {/* Person / Venue toggle */}
          <Reanimated.View entering={FadeInDown.delay(200).springify().damping(16)} style={styles.toggleWrap}>
            <Animated.View style={[styles.togglePill, { transform: [{ translateX: pillTranslateX }] }]} />
            <TouchableOpacity style={styles.toggleBtn} onPress={() => switchMode('person')} activeOpacity={0.8}>
              <Text style={[styles.toggleText, mode === 'person' && styles.toggleTextActive]}>👤 Person</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toggleBtn} onPress={() => switchMode('venue')} activeOpacity={0.8}>
              <Text style={[styles.toggleText, mode === 'venue' && styles.toggleTextActive]}>🏢 Venue</Text>
            </TouchableOpacity>
          </Reanimated.View>

          <View style={styles.form}>
            {mode === 'person' ? (
              <>
                <Reanimated.View entering={FadeInUp.delay(260).springify().damping(16)}>
                  <TextInput style={styles.input} placeholder="Display name" placeholderTextColor="#4A6580"
                    value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
                </Reanimated.View>
                <Reanimated.View entering={FadeInUp.delay(300).springify().damping(16)}>
                  <TextInput style={styles.input} placeholder="Username (no spaces)" placeholderTextColor="#4A6580"
                    value={username} onChangeText={setUsername} autoCapitalize="none" />
                </Reanimated.View>
              </>
            ) : (
              <>
                <Reanimated.View entering={FadeInUp.delay(260).springify().damping(16)}>
                  <TextInput style={styles.input} placeholder="Venue name" placeholderTextColor="#4A6580"
                    value={venueName} onChangeText={setVenueName} autoCapitalize="words" />
                </Reanimated.View>
                <Reanimated.View entering={FadeInUp.delay(300).springify().damping(16)}>
                  <TextInput style={styles.input} placeholder="Your name (owner / manager)" placeholderTextColor="#4A6580"
                    value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
                </Reanimated.View>
                <Reanimated.View entering={FadeInUp.delay(330).springify().damping(16)}>
                  <Text style={styles.typeLabel}>Venue type</Text>
                  <View style={styles.typeGrid}>
                    {VENUE_TYPES.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typePill, venueType === t && styles.typePillActive]}
                        onPress={() => setVenueType(t)}
                      >
                        <Text style={[styles.typeText, venueType === t && styles.typeTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Reanimated.View>
              </>
            )}

            <Reanimated.View entering={FadeInUp.delay(360).springify().damping(16)}>
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#4A6580"
                value={email} onChangeText={setEmail} autoCapitalize="none"
                keyboardType="email-address" autoComplete="email" />
            </Reanimated.View>

            <Reanimated.View entering={FadeInUp.delay(400).springify().damping(16)}>
              <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#4A6580"
                value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
            </Reanimated.View>

            <Reanimated.View entering={FadeInUp.delay(440).springify().damping(16)}>
              <TouchableOpacity activeOpacity={1} onPressIn={onPressIn} onPressOut={onPressOut}
                onPress={handleSignup} disabled={loading}>
                <Animated.View style={[styles.button, loading && styles.buttonDisabled, { transform: [{ scale: btnScale }] }]}>
                  {loading
                    ? <ActivityIndicator color="#050A15" />
                    : <Text style={styles.buttonText}>
                        {mode === 'venue' ? 'Register Venue' : 'Create Account'}
                      </Text>
                  }
                </Animated.View>
              </TouchableOpacity>
            </Reanimated.View>

            {mode === 'venue' && (
              <Reanimated.View entering={FadeInUp.delay(480).springify().damping(16)} style={styles.venueNote}>
                <Text style={styles.venueNoteText}>
                  📍 You'll set your exact venue address from the dashboard after signing up.
                </Text>
              </Reanimated.View>
            )}

            <Reanimated.View entering={FadeInUp.delay(500).springify().damping(16)} style={styles.footer}>
              <Link href="/(auth)/login" style={styles.link}>
                <Text style={styles.linkText}>Already have an account? Sign in →</Text>
              </Link>
            </Reanimated.View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 16 },

  glow: { position: 'absolute', borderRadius: 999, opacity: 0.11 },
  glowCyan:   { width: 300, height: 300, backgroundColor: '#29B6F6', top: -40, right: -60 },
  glowPurple: { width: 260, height: 260, backgroundColor: '#8b5cf6', bottom: 60, left: -60 },

  inner: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 44,
    backgroundColor: '#0A1628CC',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 8px 64px rgba(41,182,246,0.08), 0 2px 12px rgba(0,0,0,0.6)',
    } as any : {
      shadowColor: '#29B6F6',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 32,
      elevation: 12,
    }),
  },

  logo: { width: 80, height: 80, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '900', color: '#f8fafc', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#7A93AC', marginBottom: 24, textAlign: 'center' },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    padding: 2,
    marginBottom: 22,
    position: 'relative',
    width: 300,
    height: 44,
  },
  togglePill: {
    position: 'absolute',
    top: 2,
    width: 146,
    height: 38,
    backgroundColor: '#162840',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#29B6F640',
  },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#4A6580' },
  toggleTextActive: { color: '#29B6F6' },

  form: { width: '100%', gap: 10 },
  input: {
    backgroundColor: '#06101E',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderRadius: 12,
    padding: 15,
    color: '#f8fafc',
    fontSize: 15,
  },

  typeLabel: { fontSize: 12, fontWeight: '700', color: '#7A93AC', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    backgroundColor: '#0D1B2E', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  typePillActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  typeText: { fontSize: 13, color: '#8EADC7' },
  typeTextActive: { color: '#29B6F6', fontWeight: '700' },

  button: {
    backgroundColor: '#29B6F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 6,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 0 24px rgba(41,182,246,0.3)',
    } as any : {
      shadowColor: '#29B6F6',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
    }),
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#050A15', fontWeight: '800', fontSize: 15 },

  venueNote: {
    backgroundColor: '#29B6F610',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#29B6F630',
    marginTop: 4,
  },
  venueNoteText: { fontSize: 12, color: '#8EADC7', lineHeight: 17, textAlign: 'center' },

  footer: { alignItems: 'center', marginTop: 6 },
  link: {},
  linkText: { color: '#7A93AC', fontSize: 13 },
})
