import { useEffect, useRef, useState } from 'react'
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Easing, Platform, ActivityIndicator, Dimensions,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Redirect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

// Resolve where a logged-in user should land: venue owners go straight to the
// venue dashboard, everyone else to the map. Returns null while resolving.
// (Jacob: opening the app as a venue dropped you on the map first.)
function useLoggedInDestination(userId: string | undefined): '/(tabs)' | '/venue/dashboard' | null {
  const [dest, setDest] = useState<'/(tabs)' | '/venue/dashboard' | null>(null)
  useEffect(() => {
    if (!userId) { setDest(null); return }
    let cancelled = false
    supabase.from('profiles').select('is_venue_owner').eq('id', userId).maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDest(data?.is_venue_owner ? '/venue/dashboard' : '/(tabs)')
      })
    return () => { cancelled = true }
  }, [userId])
  return dest
}

const WIN_H = Dimensions.get('window').height

// ─── Floating orbs — more dramatic than the app screens ──────────────────────
function LandingOrbs() {
  const o1 = useRef(new Animated.Value(0)).current
  const o2 = useRef(new Animated.Value(0)).current
  const o3 = useRef(new Animated.Value(0)).current
  const o4 = useRef(new Animated.Value(0)).current
  const o5 = useRef(new Animated.Value(0)).current

  const breathe = (val: Animated.Value, dur: number, delay = 0) =>
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(val, { toValue: 0, duration: dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    )

  useEffect(() => {
    breathe(o1, 3200).start()
    breathe(o2, 4400, 600).start()
    breathe(o3, 2800, 1200).start()
    breathe(o4, 3800, 900).start()
    breathe(o5, 3500, 400).start()

    return () => { [o1, o2, o3, o4, o5].forEach((v) => v.stopAnimation()) }
  }, [])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Cyan — large, top right */}
      <Animated.View style={[s.orb, {
        width: 700, height: 700, backgroundColor: '#29B6F6',
        top: -260, right: -220,
        opacity: o1.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.28] }),
        transform: [{ translateY: o1.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }],
      }]} />

      {/* Blue — large, top left */}
      <Animated.View style={[s.orb, {
        width: 580, height: 580, backgroundColor: '#1E40AF',
        top: -140, left: -200,
        opacity: o2.interpolate({ inputRange: [0, 1], outputRange: [0.09, 0.22] }),
        transform: [{ translateY: o2.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }],
      }]} />

      {/* Purple — mid right */}
      <Animated.View style={[s.orb, {
        width: 440, height: 440, backgroundColor: '#7C3AED',
        top: 260, right: -140,
        opacity: o3.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.20] }),
        transform: [{ translateY: o3.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) }],
      }]} />

      {/* Teal — mid left */}
      <Animated.View style={[s.orb, {
        width: 360, height: 360, backgroundColor: '#0891B2',
        top: 380, left: -120,
        opacity: o4.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] }),
        transform: [{ translateY: o4.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }],
      }]} />

      {/* Cyan — bottom right accent */}
      <Animated.View style={[s.orb, {
        width: 300, height: 300, backgroundColor: '#29B6F6',
        bottom: 60, right: -80,
        opacity: o5.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.24] }),
        transform: [{ translateY: o5.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }],
      }]} />
    </View>
  )
}

// ─── Bouncing scroll indicator ────────────────────────────────────────────────
function ScrollCaret() {
  const y = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(y, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    ).start()
    return () => y.stopAnimation()
  }, [])

  return (
    <Animated.View
      style={{ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) }] }}
      pointerEvents="none"
    >
      <Ionicons name="chevron-down" size={22} color="#29B6F630" />
    </Animated.View>
  )
}

// ─── Native path: handle auth redirect only ───────────────────────────────────
function NativeIndex() {
  const { session, loading } = useAuth()
  const dest = useLoggedInDestination(session?.user?.id)

  if (loading || (session && !dest)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Image
          source={require('@/assets/logo-flower.png')}
          style={{ width: 120, height: 120, borderRadius: 30 }}
          resizeMode="contain"
        />
        <Image
          source={require('@/assets/logo-wordmark.png')}
          style={{ width: 220, height: 39 }}
          resizeMode="contain"
        />
        <ActivityIndicator color="#29B6F6" style={{ marginTop: 4 }} />
      </View>
    )
  }

  return <Redirect href={session ? (dest ?? '/(tabs)') : '/(auth)/login'} />
}

// ─── Web landing page ─────────────────────────────────────────────────────────
function WebLanding() {
  const { session, loading } = useAuth()
  const dest = useLoggedInDestination(session?.user?.id)

  if (loading || (session && !dest)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  if (session) return <Redirect href={dest ?? '/(tabs)'} />

  const features = [
    {
      label: 'Check in.',
      desc:  'Enter a venue. Set your Social Mode and Mood — tell the room who you are tonight.',
      icon:  'location-outline' as const,
    },
    {
      label: 'Connect.',
      desc:  'See who else is here right now. Send a We Met when something real happens.',
      icon:  'people-outline' as const,
    },
    {
      label: 'Leave a trace.',
      desc:  "Post to the zone. Visible only to people at the venue. Gone in 12 hours. That's the point.",
      icon:  'flame-outline' as const,
    },
  ]

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <View style={[s.hero, { height: Platform.OS === 'web' ? ('100dvh' as any) : WIN_H }]}>
        <LandingOrbs />

        {/* Dot-grid texture — web only, RN ignores unknown style props */}
        <View
          style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? ({
            backgroundImage: 'radial-gradient(rgba(41,182,246,0.055) 1px, transparent 1px)',
            backgroundSize:  '28px 28px',
          } as any) : null]}
          pointerEvents="none"
        />

        <View style={s.heroContent}>
          <Reanimated.View entering={FadeInDown.delay(0).duration(700)}>
            <View style={s.badge}>
              <View style={s.badgeDot} />
              <Text style={s.badgeText}>Early access · Nashville, TN</Text>
            </View>
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.delay(120).duration(800)}>
            <Image
              source={require('@/assets/logo-wordmark.png')}
              style={s.heroWordmark}
              resizeMode="contain"
            />
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.delay(260).duration(800)}>
            <Text style={s.sub}>
              The people around you are more{'\n'}interesting than your feed.
            </Text>
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.delay(400).duration(800)} style={s.ctaRow}>
            <TouchableOpacity
              style={s.ctaPrimary}
              onPress={() => router.push('/(auth)/signup')}
              activeOpacity={0.85}
            >
              <Text style={s.ctaPrimaryText}>Get Started</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.ctaSecondary}
              onPress={() => router.push('/(auth)/login')}
              activeOpacity={0.85}
            >
              <Text style={s.ctaSecondaryText}>Sign In</Text>
            </TouchableOpacity>
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.delay(560).duration(700)}>
            <Text style={s.footnote}>
              No algorithms. No followers. Just people nearby.
            </Text>
          </Reanimated.View>
        </View>

        {/* Bouncing scroll caret pinned to bottom */}
        <View style={s.caretWrap} pointerEvents="none">
          <ScrollCaret />
        </View>
      </View>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionInner}>
          <Text style={s.sectionLabel}>How it works</Text>

          {features.map((f, i) => (
            <Reanimated.View
              key={f.label}
              entering={FadeInDown.delay(i * 100).duration(600)}
              style={[s.featureRow, i < features.length - 1 && s.featureRowBorder]}
            >
              <View style={s.featureIconWrap}>
                <Ionicons name={f.icon} size={20} color="#29B6F6" />
              </View>
              <View style={s.featureBody}>
                <Text style={s.featureLabel}>{f.label}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
            </Reanimated.View>
          ))}
        </View>
      </View>

      {/* ── VENUE ──────────────────────────────────────────────────────────── */}
      <View style={s.venueWrap}>
        <View style={s.venueCard}>
          <View style={s.venueIconWrap}>
            <Ionicons name="business-outline" size={24} color="#29B6F6" />
          </View>
          <Text style={s.venueHeadline}>Build a space people actually talk about.</Text>
          <Text style={s.venueSub}>
            HereNow gives your venue a live social layer — check-ins, zone posts, real connections.
            Your regulars leave with something to remember.
          </Text>
          <TouchableOpacity
            style={s.venueBtn}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.8}
          >
            <Text style={s.venueBtnText}>Partner with us</Text>
            <Ionicons name="arrow-forward-outline" size={14} color="#29B6F6" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <View style={s.footer}>
        <Text style={s.footerBrand}>HereNow</Text>
        <Text style={s.footerTagline}>An IRL social layer for the real world.</Text>
        <View style={s.footerLinks}>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={s.footerLink}>Sign up</Text>
          </TouchableOpacity>
          <Text style={s.footerDot}>·</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={s.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.footerCopy}>© 2026 Gilgamesh Enterprise LLC</Text>
      </View>
    </ScrollView>
  )
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export default function Index() {
  if (Platform.OS !== 'web') return <NativeIndex />
  return <WebLanding />
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll:        { flex: 1, backgroundColor: '#050A15' },
  scrollContent: { flexGrow: 1 },

  // hero
  hero:          { backgroundColor: '#050A15', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  heroContent:   { alignItems: 'center', paddingHorizontal: 24, maxWidth: 520, width: '100%' as any, gap: 28, zIndex: 1 },

  // badge
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#29B6F620', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
  badgeDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  badgeText:    { fontSize: 13, color: '#8EADC7', fontWeight: '500' },

  // headline + sub
  headline:     { fontSize: 88, fontWeight: '900', color: '#29B6F6', textAlign: 'center', letterSpacing: -4, lineHeight: 90 },
  heroWordmark: { width: '82%', maxWidth: 360, aspectRatio: 822 / 147, alignSelf: 'center' },
  sub:          { fontSize: 19, color: '#7A93AC', textAlign: 'center', lineHeight: 28, fontWeight: '400' },

  // CTAs
  ctaRow:           { flexDirection: 'row', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  ctaPrimary:       { backgroundColor: '#29B6F6', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 15 },
  ctaPrimaryText:   { color: '#050A15', fontWeight: '800', fontSize: 16 },
  ctaSecondary:     { borderWidth: 1, borderColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 15, backgroundColor: '#0D1B2E' },
  ctaSecondaryText: { color: '#f8fafc', fontWeight: '700', fontSize: 16 },

  // footnote + caret
  footnote:  { fontSize: 12, color: '#3A5570', textAlign: 'center', letterSpacing: 0.4 },
  caretWrap: { position: 'absolute', bottom: 32, alignItems: 'center' },

  // orb base
  orb: { position: 'absolute', borderRadius: 999 },

  // HOW IT WORKS
  section:         { backgroundColor: '#050A15', borderTopWidth: 1, borderTopColor: '#0D1B2E', paddingVertical: 64, paddingHorizontal: 24 },
  sectionInner:    { maxWidth: 560, width: '100%' as any, alignSelf: 'center' as const },
  sectionLabel:    { fontSize: 11, fontWeight: '700', color: '#3A5570', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 36 },
  featureRow:      { flexDirection: 'row', gap: 18, paddingVertical: 22 },
  featureRowBorder:{ borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  featureIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#29B6F610', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  featureBody:     { flex: 1 },
  featureLabel:    { fontSize: 17, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  featureDesc:     { fontSize: 14, color: '#7A93AC', lineHeight: 21 },

  // VENUE
  venueWrap:     { backgroundColor: '#050A15', borderTopWidth: 1, borderTopColor: '#0D1B2E', paddingVertical: 64, paddingHorizontal: 24 },
  venueCard:     { maxWidth: 560, width: '100%' as any, alignSelf: 'center' as const, backgroundColor: '#07101F', borderRadius: 20, borderWidth: 1, borderColor: '#29B6F618', padding: 36, gap: 16 },
  venueIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#29B6F610', alignItems: 'center', justifyContent: 'center' },
  venueHeadline: { fontSize: 24, fontWeight: '800', color: '#f8fafc', lineHeight: 31 },
  venueSub:      { fontSize: 15, color: '#7A93AC', lineHeight: 23 },
  venueBtn:      { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' as const, marginTop: 8, backgroundColor: '#29B6F612', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, borderWidth: 1, borderColor: '#29B6F630' },
  venueBtnText:  { color: '#29B6F6', fontWeight: '700', fontSize: 14 },

  // FOOTER
  footer:        { backgroundColor: '#050A15', borderTopWidth: 1, borderTopColor: '#0D1B2E', paddingVertical: 40, paddingHorizontal: 24, alignItems: 'center', gap: 12 },
  footerBrand:   { fontSize: 20, fontWeight: '900', color: '#29B6F6', letterSpacing: -0.5 },
  footerTagline: { fontSize: 13, color: '#3A5570' },
  footerLinks:   { flexDirection: 'row', gap: 12, alignItems: 'center' },
  footerLink:    { fontSize: 13, color: '#5A7A9A', fontWeight: '600' },
  footerDot:     { color: '#1E3A5F', fontSize: 16 },
  footerCopy:    { fontSize: 11, color: '#1E3A5F', marginTop: 4 },
})
