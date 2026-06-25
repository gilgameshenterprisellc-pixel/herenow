import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Animated, Easing, Platform, ActivityIndicator, Alert,
} from 'react-native'
import Reanimated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated'
import { Image } from 'react-native'
import { Link, router } from 'expo-router'
import { supabase } from '@/lib/supabase'

type Mode = 'person' | 'venue'

export default function LoginScreen() {
  const [mode, setMode]         = useState<Mode>('person')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [toggleWidth, setToggleWidth] = useState(0)

  // Sliding pill
  const pillAnim = useRef(new Animated.Value(0)).current
  const orb1     = useRef(new Animated.Value(0)).current
  const orb2     = useRef(new Animated.Value(0)).current
  const orb3     = useRef(new Animated.Value(0)).current
  const orb4     = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const breathe = (val: Animated.Value, dur: number, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(val, { toValue: 0, duration: dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      )
    breathe(orb1, 3000).start()
    breathe(orb2, 4200, 600).start()
    breathe(orb3, 2700, 1300).start()
    breathe(orb4, 3800, 900).start()
  }, [])

  const switchMode = (m: Mode) => {
    setMode(m)
    Animated.spring(pillAnim, {
      toValue: m === 'venue' ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
    }).start()
  }

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    setLoading(false)

    if (error) { Alert.alert('Login failed', error.message); return }

    if (mode === 'venue') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_venue_owner')
        .eq('id', data.user.id)
        .maybeSingle()
      if (profile?.is_venue_owner) {
        router.replace('/venue/dashboard' as any)
      } else {
        Alert.alert('Not a venue account', "This email isn't registered as a venue. Switch to Person or register a new venue.")
      }
    } else {
      router.replace('/(tabs)')
    }
  }

  const pillX = toggleWidth > 0
    ? pillAnim.interpolate({ inputRange: [0, 1], outputRange: [2, toggleWidth / 2] })
    : new Animated.Value(2)

  const o1s = orb1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] })
  const o1o = orb1.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] })
  const o2s = orb2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] })
  const o2o = orb2.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] })
  const o3s = orb3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] })
  const o3o = orb3.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] })
  const o4o = orb4.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.65] })
  const o4s = orb4.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] })

  const isVenue = mode === 'venue'

  return (
    <View style={styles.root}>

      {/* Top-right bloom cluster */}
      <Animated.View style={[styles.orb, { width: 420, height: 420, backgroundColor: '#0A4DCA', top: -130, right: -140, opacity: o1o, transform: [{ scale: o1s }] }]} />
      <Animated.View style={[styles.orb, { width: 160, height: 160, backgroundColor: '#29B6F6', top: -40, right: -30,
        opacity: orb1.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }),
        transform: [{ scale: orb1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
      }]} />

      {/* Bottom-left bloom cluster */}
      <Animated.View style={[styles.orb, { width: 380, height: 380, backgroundColor: '#003FA0', bottom: -110, left: -120, opacity: o2o, transform: [{ scale: o2s }] }]} />
      <Animated.View style={[styles.orb, { width: 140, height: 140, backgroundColor: '#1E90FF', bottom: -20, left: 0,
        opacity: orb2.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.75] }),
      }]} />

      {/* Left-center accent */}
      <Animated.View style={[styles.orb, { width: 240, height: 240, backgroundColor: '#006699', top: '38%', left: -80, opacity: o3o, transform: [{ scale: o3s }] }]} />

      {/* Top-center subtle */}
      <Animated.View style={[styles.orb, { width: 300, height: 300, backgroundColor: '#0A3A80', top: -60, left: '25%', opacity: o4o, transform: [{ scale: o4s }] }]} />

      {/* Card */}
      <View style={[
        styles.card,
        Platform.OS === 'web'
          ? { boxShadow: '0 0 0 1px rgba(41,182,246,0.4), 0 0 40px rgba(41,182,246,0.35), 0 0 90px rgba(41,182,246,0.18), 0 0 160px rgba(41,182,246,0.08)' } as any
          : { shadowColor: '#29B6F6', shadowOpacity: 0.55, shadowRadius: 40, shadowOffset: { width: 0, height: 0 }, elevation: 28 }
      ]}>

        <Reanimated.View entering={ZoomIn.springify().damping(14)}>
          <Image source={require('@/assets/logo.webp')} style={styles.logo} resizeMode="contain" />
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.delay(60).springify().damping(16)}>
          <Text style={styles.title}>HereNow</Text>
          <Text style={styles.subtitle}>You Had To Be There</Text>
        </Reanimated.View>

        {/* Toggle */}
        <Reanimated.View entering={FadeInDown.delay(120).springify().damping(16)} style={{ width: '100%' }}>
          <View
            style={styles.toggle}
            onLayout={(e) => setToggleWidth(e.nativeEvent.layout.width)}
          >
            {toggleWidth > 0 && (
              <Animated.View
                style={[
                  styles.pill,
                  { width: toggleWidth / 2 - 4, transform: [{ translateX: pillX }] },
                  Platform.OS === 'web'
                    ? { boxShadow: '0 0 12px rgba(41,182,246,0.7)' } as any
                    : { shadowColor: '#29B6F6', shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }
                ]}
              />
            )}
            <TouchableOpacity style={styles.toggleOpt} onPress={() => switchMode('person')} activeOpacity={0.8}>
              <Text style={[styles.toggleTxt, !isVenue && styles.toggleTxtOn]}>👤 Person</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toggleOpt} onPress={() => switchMode('venue')} activeOpacity={0.8}>
              <Text style={[styles.toggleTxt, isVenue && styles.toggleTxtOn]}>🏢 Venue</Text>
            </TouchableOpacity>
          </View>
        </Reanimated.View>

        {/* Inputs */}
        <Reanimated.View entering={FadeInDown.delay(180).springify().damping(16)} style={{ width: '100%', gap: 10 }}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#2B4560"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#2B4560"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
        </Reanimated.View>

        <Reanimated.View entering={FadeInUp.delay(220).springify().damping(16)} style={{ width: '100%' }}>
          <TouchableOpacity
            style={[
              styles.btn,
              loading && { opacity: 0.6 },
              Platform.OS === 'web'
                ? { boxShadow: '0 0 24px rgba(41,182,246,0.55), 0 4px 20px rgba(41,182,246,0.4)' } as any
                : { shadowColor: '#29B6F6', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 4 } }
            ]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#050A15" />
              : <Text style={styles.btnTxt}>{isVenue ? 'Sign In to Venue Dashboard' : 'Sign In'}</Text>
            }
          </TouchableOpacity>
        </Reanimated.View>

        <Reanimated.View entering={FadeInUp.delay(280).springify().damping(16)}>
          <Link href="/(auth)/signup">
            <Text style={styles.footerLink}>
              {isVenue ? 'Register a new venue →' : 'New here? Create an account →'}
            </Text>
          </Link>
        </Reanimated.View>

      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020810',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    // @ts-ignore
    pointerEvents: 'none',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    marginHorizontal: 20,
    backgroundColor: '#060D1A',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.2)',
    paddingHorizontal: 26,
    paddingVertical: 30,
    alignItems: 'center',
    gap: 16,
  },
  logo: { width: 80, height: 80, borderRadius: 20, marginBottom: 2 },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#3A5C7A',
    textAlign: 'center',
    marginTop: -8,
  },
  toggle: {
    height: 44,
    backgroundColor: '#0B1526',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.15)',
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 9,
    backgroundColor: '#29B6F6',
  },
  toggleOpt: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  toggleTxt: { fontSize: 13, fontWeight: '700', color: '#3A5C7A' },
  toggleTxtOn: { color: '#020810' },
  input: {
    backgroundColor: '#0B1526',
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.15)',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: '#f8fafc',
    fontSize: 15,
    width: '100%',
  },
  btn: {
    backgroundColor: '#29B6F6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  btnTxt: { color: '#020810', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
  footerLink: { color: '#3A5C7A', fontSize: 13, textAlign: 'center', paddingTop: 4 },
})
