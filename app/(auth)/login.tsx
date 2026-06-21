import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated,
} from 'react-native'
import { Image } from 'react-native'
import { Link, router } from 'expo-router'
import Reanimated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated'
import { supabase } from '@/lib/supabase'

type Mode = 'person' | 'venue'

export default function LoginScreen() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [mode, setMode]         = useState<Mode>('person')

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

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      setLoading(false)
      Alert.alert('Login failed', error?.message ?? 'Unknown error')
      return
    }

    // Check if this user is a venue owner and route accordingly
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_venue_owner')
      .eq('id', data.user.id)
      .maybeSingle()

    setLoading(false)
    if (profile?.is_venue_owner) {
      router.replace('/venue/dashboard' as any)
    } else {
      router.replace('/(tabs)')
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
      <View style={[styles.glow, styles.glowBlue]} />

      <View style={styles.inner}>
        {/* Logo */}
        <Reanimated.View entering={ZoomIn.springify().damping(14).delay(0)}>
          <Image source={require('@/assets/logo.webp')} style={styles.logo} resizeMode="contain" />
        </Reanimated.View>

        <Reanimated.Text entering={FadeInDown.delay(80).springify().damping(16)} style={styles.title}>
          HereNow
        </Reanimated.Text>
        <Reanimated.Text entering={FadeInDown.delay(140).springify().damping(16)} style={styles.subtitle}>
          Connect where you are.
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
          <Reanimated.View entering={FadeInUp.delay(260).springify().damping(16)}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#4A6580"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </Reanimated.View>

          <Reanimated.View entering={FadeInUp.delay(320).springify().damping(16)}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#4A6580"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />
          </Reanimated.View>

          <Reanimated.View entering={FadeInUp.delay(380).springify().damping(16)}>
            <TouchableOpacity
              activeOpacity={1}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              onPress={handleLogin}
              disabled={loading}
            >
              <Animated.View style={[styles.button, loading && styles.buttonDisabled, { transform: [{ scale: btnScale }] }]}>
                {loading
                  ? <ActivityIndicator color="#050A15" />
                  : <Text style={styles.buttonText}>
                      {mode === 'venue' ? 'Sign In to Venue Dashboard' : 'Sign In'}
                    </Text>
                }
              </Animated.View>
            </TouchableOpacity>
          </Reanimated.View>

          <Reanimated.View entering={FadeInUp.delay(440).springify().damping(16)} style={styles.footer}>
            <Link href="/(auth)/signup" style={styles.link}>
              <Text style={styles.linkText}>
                {mode === 'venue' ? 'Register a new venue →' : 'New here? Create an account →'}
              </Text>
            </Link>
          </Reanimated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },

  glow: { position: 'absolute', borderRadius: 999, opacity: 0.12 },
  glowCyan: {
    width: 320, height: 320,
    backgroundColor: '#29B6F6',
    top: -60, left: -80,
  },
  glowBlue: {
    width: 280, height: 280,
    backgroundColor: '#3b82f6',
    bottom: 40, right: -60,
  },

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

  logo: { width: 84, height: 84, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '900', color: '#f8fafc', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#7A93AC', marginBottom: 28 },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    padding: 2,
    marginBottom: 24,
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
  footer: { alignItems: 'center', marginTop: 6 },
  link: {},
  linkText: { color: '#7A93AC', fontSize: 13 },
})
