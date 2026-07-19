import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Animated, Easing, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Reanimated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated'
import { Image } from 'react-native'
import { Link, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { geocodeAddress, fetchBuildingPolygon, AUTO_APPROVE_THRESHOLD } from '@/lib/geocoding'

type Mode = 'person' | 'venue'

const VENUE_TYPES = ['Bar', 'Restaurant', 'Coffee Shop', 'Venue / Event Space', 'Gym', 'Other']

// Normalize a typed phone to E.164. Bare 10-digit input is assumed US (+1).
function toE164(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '')
    return digits.length >= 8 ? `+${digits}` : null
  }
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export default function SignupScreen() {
  const [mode, setMode]             = useState<Mode>('person')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername]       = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [phone, setPhone]             = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [venueName, setVenueName]     = useState('')
  const [venueType, setVenueType]     = useState<string | null>(null)
  const [venueAddress, setVenueAddress] = useState('')
  const [venueSuite, setVenueSuite]     = useState('')
  const [venueCity, setVenueCity]       = useState('')
  const [venueState, setVenueState]     = useState('')
  const [venueZip, setVenueZip]         = useState('')
  const [gender, setGender]             = useState('')
  const [loading, setLoading]           = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [errorMsg, setErrorMsg]         = useState('')
  const [toggleWidth, setToggleWidth] = useState(0)

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
    breathe(orb1, 3200).start()
    breathe(orb2, 4400, 700).start()
    breathe(orb3, 2900, 1400).start()
    breathe(orb4, 3600, 500).start()
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

  const GENDER_OPTIONS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say']

  const VENUE_TYPE_MAP: Record<string, string> = {
    'Bar': 'bar',
    'Restaurant': 'restaurant',
    'Coffee Shop': 'cafe',
    'Venue / Event Space': 'venue',
    'Gym': 'other',
    'Other': 'other',
  }

  const handleSignup = async () => {
    const isVenue = mode === 'venue'
    if (isVenue) {
      if (!venueName.trim() || !email.trim() || !password.trim()) {
        setErrorMsg('Enter venue name, email, and password.')
        return
      }
      if (!venueAddress.trim() || !venueCity.trim() || !venueState.trim() || !venueZip.trim()) {
        setErrorMsg("Enter your venue's full address so we can set up your check-in zone.")
        return
      }
    } else {
      if (!displayName.trim() || !username.trim() || !email.trim() || !password.trim()) {
        setErrorMsg('Please fill in all fields.')
        return
      }
      if (!ageConfirmed) {
        setErrorMsg('HereNow is 18+. Confirm your age to create an account.')
        return
      }
    }

    // Phone required for everyone — one number per account (anti-fraud).
    const e164 = toE164(phone)
    if (!e164) {
      setErrorMsg('Enter a valid phone number (e.g. 615 555 0198).')
      return
    }

    setErrorMsg('')
    setLoading(true)

    // Pre-check phone + username BEFORE creating the auth user. signUp creates the
    // account first; if the profile insert then fails on a duplicate phone/username,
    // the auth user is orphaned and (email confirmation is off) the email can never
    // be reused. Catch the collision up front. Degrades gracefully: if the RPC is
    // unreachable, we fall through and the unique indexes still protect the data.
    const precheckUsername = isVenue ? '' : username.toLowerCase().replace(/[^a-z0-9_]/g, '')
    const { data: availability } = await supabase.rpc('signup_availability', {
      p_phone:    e164,
      p_username: precheckUsername || null,
    })
    if (availability === 'phone_taken' || availability === 'username_taken') {
      setLoading(false)
      setErrorMsg(
        availability === 'phone_taken'
          ? 'That phone number is already registered. One account per number.'
          : 'That username is taken — try another.'
      )
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error || !data.user) {
      setLoading(false)
      setErrorMsg(error?.message ?? 'Signup failed — please try again.')
      return
    }

    // Geocode via Mapbox (precise, building-level) with Nominatim fallback
    let coords: { lat: number; lng: number; confidence: number } | null = null
    if (isVenue && venueAddress.trim()) {
      coords = await geocodeAddress(
        venueAddress.trim(),
        venueSuite.trim(),
        venueCity.trim(),
        venueState.trim().toUpperCase(),
        venueZip.trim(),
      )
    }

    const cleanUsername = isVenue
      ? venueName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || `venue_${data.user.id.slice(0, 6)}`
      : username.toLowerCase().replace(/[^a-z0-9_]/g, '')

    const mappedType = venueType ? (VENUE_TYPE_MAP[venueType] ?? venueType.toLowerCase()) : 'venue'
    const highConfidence = (coords?.confidence ?? 0) >= AUTO_APPROVE_THRESHOLD

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      display_name: isVenue ? venueName.trim() : displayName.trim(),
      username: cleanUsername,
      phone: e164,
      is_venue_owner: isVenue,
      // Always insert as pending — auto_approve_venue RPC sets it to approved atomically.
      // This ensures no venue is ever marked approved without a zone existing.
      venue_status: isVenue ? 'pending' : 'none',
      ...(isVenue ? {
        email:                    email.trim().toLowerCase(),
        venue_type:               mappedType,
        venue_address:            venueAddress.trim(),
        venue_suite:              venueSuite.trim() || null,
        venue_city:               venueCity.trim(),
        venue_state:              venueState.trim().toUpperCase(),
        venue_zip:                venueZip.trim(),
        venue_lat:                coords?.lat ?? null,
        venue_lng:                coords?.lng ?? null,
        venue_geocode_confidence: coords?.confidence ?? null,
      } : {
        gender: gender || null,
      }),
    })

    if (profileError) {
      setLoading(false)
      // Unique phone violation — the deterrent Jacob asked for.
      if (/duplicate|unique/i.test(profileError.message) && /phone/i.test(profileError.message)) {
        setErrorMsg('That phone number is already registered. One account per number.')
      } else {
        setErrorMsg(profileError.message)
      }
      return
    }

    // Auto-approve: Mapbox returned high-confidence coordinates — create the zone and
    // flip venue_status to approved atomically inside the RPC.
    // If the RPC fails, venue stays pending and falls to admin queue — no orphaned approvals.
    // When Stripe is wired up, this same RPC gets called from the payment webhook instead.
    if (isVenue && highConfidence && coords) {
      // Fetch building polygon from OSM — precise footprint for check-in gating.
      // Non-fatal: if OSM has no data, zone falls back to 75m circle.
      const polygon = await fetchBuildingPolygon(coords.lat, coords.lng)

      const { error: approveError } = await supabase.rpc('auto_approve_venue', {
        p_profile_id:  data.user.id,
        p_lat:         coords.lat,
        p_lng:         coords.lng,
        p_name:        venueName.trim(),
        p_type:        mappedType,
        p_radius:      10,
        p_polygon_wkt: polygon?.wkt ?? null,
      })
      if (approveError) {
        console.error('[signup] auto_approve_venue failed — venue stays pending:', approveError.message)
      }
    }

    setLoading(false)

    if (isVenue) {
      router.replace('/venue/dashboard' as any)
    } else {
      router.replace('/profile/edit')
    }
  }

  const pillX = toggleWidth > 0
    ? pillAnim.interpolate({ inputRange: [0, 1], outputRange: [2, toggleWidth / 2] })
    : new Animated.Value(2)

  const o1s = orb1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] })
  const o1o = orb1.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.58] })
  const o2s = orb2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] })
  const o2o = orb2.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.46] })
  const o3s = orb3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.38] })
  const o3o = orb3.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.52] })
  const o4o = orb4.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.62] })
  const o4s = orb4.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] })

  const isVenue = mode === 'venue'

  return (
    <View style={styles.root}>

      {/* Top-left bloom cluster */}
      <Animated.View style={[styles.orb, { width: 380, height: 380, backgroundColor: '#0A4DCA', top: -120, left: -130, opacity: o1o, transform: [{ scale: o1s }] }]} />
      <Animated.View style={[styles.orb, { width: 150, height: 150, backgroundColor: '#29B6F6', top: -30, left: -20,
        opacity: orb1.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] }),
        transform: [{ scale: orb1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
      }]} />

      {/* Bottom-right bloom cluster */}
      <Animated.View style={[styles.orb, { width: 360, height: 360, backgroundColor: '#003FA0', bottom: -100, right: -110, opacity: o2o, transform: [{ scale: o2s }] }]} />
      <Animated.View style={[styles.orb, { width: 130, height: 130, backgroundColor: '#1E90FF', bottom: -15, right: 0,
        opacity: orb2.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.72] }),
      }]} />

      {/* Right-center accent */}
      <Animated.View style={[styles.orb, { width: 220, height: 220, backgroundColor: '#006699', top: '30%', right: -70, opacity: o3o, transform: [{ scale: o3s }] }]} />

      {/* Top-center subtle */}
      <Animated.View style={[styles.orb, { width: 280, height: 280, backgroundColor: '#0A3A80', top: -40, left: '30%', opacity: o4o, transform: [{ scale: o4s }] }]} />

      <ScrollView
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[
          styles.card,
          Platform.OS === 'web'
            ? { boxShadow: '0 0 0 1px rgba(41,182,246,0.4), 0 0 40px rgba(41,182,246,0.35), 0 0 90px rgba(41,182,246,0.18), 0 0 160px rgba(41,182,246,0.08)' } as any
            : { shadowColor: '#29B6F6', shadowOpacity: 0.5, shadowRadius: 40, shadowOffset: { width: 0, height: 0 }, elevation: 28 }
        ]}>

          <Reanimated.View entering={ZoomIn.springify().damping(14)}>
            <Image source={require('@/assets/logo-flower.png')} style={styles.logo} resizeMode="contain" />
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.delay(60).springify().damping(16)} style={{ alignItems: 'center' }}>
            <Image source={require('@/assets/logo-wordmark.png')} style={styles.wordmark} resizeMode="contain" />
            <Text style={styles.subtitle}>Be present. Connect locally.</Text>
          </Reanimated.View>

          {/* Toggle */}
          <Reanimated.View entering={FadeInDown.delay(110).springify().damping(16)} style={{ width: '100%' }}>
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
                <Text style={[styles.toggleTxt, !isVenue && styles.toggleTxtOn]}>Person</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toggleOpt} onPress={() => switchMode('venue')} activeOpacity={0.8}>
                <Text style={[styles.toggleTxt, isVenue && styles.toggleTxtOn]}>Venue</Text>
              </TouchableOpacity>
            </View>
          </Reanimated.View>

          {/* Person fields */}
          {!isVenue && (
            <Reanimated.View entering={FadeInDown.delay(160).springify().damping(16)} style={styles.fields}>
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor="#2B4560"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="Username (no spaces)"
                placeholderTextColor="#2B4560"
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>Gender <Text style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11, fontWeight: '400', color: '#2B4560' }}>(private · optional)</Text></Text>
              <View style={styles.typeGrid}>
                {GENDER_OPTIONS.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.typePill, gender === g && styles.typePillOn]}
                    onPress={() => setGender(gender === g ? '' : g)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.typeTxt, gender === g && styles.typeTxtOn]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#2B4560"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#2B4560"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[styles.input, { paddingRight: 46 }]}
                  placeholder="Password"
                  placeholderTextColor="#2B4560"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  autoComplete="new-password"
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  onPress={() => setShowPw(v => !v)}
                >
                  <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color="#7A93AC" />
                </TouchableOpacity>
              </View>
            </Reanimated.View>
          )}

          {/* Venue fields */}
          {isVenue && (
            <Reanimated.View entering={FadeInDown.delay(160).springify().damping(16)} style={styles.fields}>
              <TextInput
                style={styles.input}
                placeholder="Venue name"
                placeholderTextColor="#2B4560"
                value={venueName}
                onChangeText={setVenueName}
                autoCapitalize="words"
              />
              <Text style={styles.fieldLabel}>Venue type</Text>
              <View style={styles.typeGrid}>
                {VENUE_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typePill, venueType === t && styles.typePillOn]}
                    onPress={() => setVenueType(venueType === t ? null : t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.typeTxt, venueType === t && styles.typeTxtOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Venue address</Text>
              <TextInput
                style={styles.input}
                placeholder="Street address"
                placeholderTextColor="#2B4560"
                value={venueAddress}
                onChangeText={setVenueAddress}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="Suite / Unit / Floor (optional)"
                placeholderTextColor="#2B4560"
                value={venueSuite}
                onChangeText={setVenueSuite}
                autoCapitalize="words"
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 3 }]}
                  placeholder="City"
                  placeholderTextColor="#2B4560"
                  value={venueCity}
                  onChangeText={setVenueCity}
                  autoCapitalize="words"
                />
                <TextInput
                  style={[styles.input, { flex: 1.5 }]}
                  placeholder="ST"
                  placeholderTextColor="#2B4560"
                  value={venueState}
                  onChangeText={(t) => setVenueState(t.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={2}
                />
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  placeholder="ZIP"
                  placeholderTextColor="#2B4560"
                  value={venueZip}
                  onChangeText={setVenueZip}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#2B4560"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#2B4560"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[styles.input, { paddingRight: 46 }]}
                  placeholder="Password"
                  placeholderTextColor="#2B4560"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  autoComplete="new-password"
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  onPress={() => setShowPw(v => !v)}
                >
                  <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color="#7A93AC" />
                </TouchableOpacity>
              </View>
            </Reanimated.View>
          )}

          {!isVenue && (
            <TouchableOpacity
              style={styles.ageRow}
              onPress={() => setAgeConfirmed(!ageConfirmed)}
              activeOpacity={0.7}
            >
              <View style={[styles.ageBox, ageConfirmed && styles.ageBoxChecked]}>
                {ageConfirmed && <Text style={styles.ageCheck}>✓</Text>}
              </View>
              <Text style={styles.ageText}>I'm 18 or older</Text>
            </TouchableOpacity>
          )}

          {!!errorMsg && (
            <Text style={styles.errorMsg}>{errorMsg}</Text>
          )}

          <Reanimated.View entering={FadeInUp.delay(240).springify().damping(16)} style={{ width: '100%' }}>
            <TouchableOpacity
              style={[
                styles.btn,
                loading && { opacity: 0.6 },
                Platform.OS === 'web'
                  ? { boxShadow: '0 0 24px rgba(41,182,246,0.55), 0 4px 20px rgba(41,182,246,0.4)' } as any
                  : { shadowColor: '#29B6F6', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 4 } }
              ]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#020810" />
                : <Text style={styles.btnTxt}>{isVenue ? 'Register Venue' : 'Create Account'}</Text>
              }
            </TouchableOpacity>
          </Reanimated.View>

          <Reanimated.View entering={FadeInUp.delay(300).springify().damping(16)}>
            <Link href="/(auth)/login">
              <Text style={styles.footerLink}>Already have an account? Sign in →</Text>
            </Link>
          </Reanimated.View>

        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020810' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
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
    gap: 14,
  },
  logo: { width: 76, height: 76, borderRadius: 18, marginBottom: 2 },
  wordmark: { width: 170, height: 30 },
  subtitle: { fontSize: 13, color: '#3A5C7A', textAlign: 'center', marginTop: 10 },
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
  fields: { width: '100%', gap: 10 },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: '#3A5C7A',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
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
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    backgroundColor: '#0B1526', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(41,182,246,0.15)',
  },
  typePillOn: { backgroundColor: 'rgba(41,182,246,0.12)', borderColor: '#29B6F6' },
  typeTxt: { fontSize: 13, color: '#3A5C7A', fontWeight: '600' },
  typeTxtOn: { color: '#29B6F6', fontWeight: '700' },
  btn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  btnTxt: { color: '#020810', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
  footerLink: { color: '#3A5C7A', fontSize: 13, textAlign: 'center', paddingTop: 4 },
  errorMsg: { color: '#f87171', fontSize: 13, textAlign: 'center', paddingHorizontal: 4, lineHeight: 18 },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', paddingVertical: 2 },
  ageBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: '#1A2E4A', backgroundColor: '#0D1B2E',
    alignItems: 'center', justifyContent: 'center',
  },
  ageBoxChecked: { borderColor: '#29B6F6', backgroundColor: '#29B6F622' },
  ageCheck: { color: '#29B6F6', fontSize: 14, fontWeight: '800', lineHeight: 16 },
  ageText: { color: '#7A93AC', fontSize: 13 },
})
