import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { Contest } from '@/lib/contests'
import { statusLabel, withAlpha, isPublicOnVenuePage } from '@/lib/contestFormat'

// The strip at the top of a venue page while a contest is on. It shows to
// everyone looking at the venue, checked in or not, because "there's a bull
// riding contest happening right now" is the reason to walk in.

/** A dot that breathes while something is live. */
export function LiveDot({ color, size = 8, still = false }: { color: string; size?: number; still?: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (still) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [still, pulse])
  return (
    <View style={{ width: size * 2.4, height: size * 2.4, alignItems: 'center', justifyContent: 'center' }}>
      {!still && (
        <Animated.View
          style={{
            position: 'absolute', width: size * 2.4, height: size * 2.4, borderRadius: size * 1.2,
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  )
}

function subline(c: Contest): string {
  const people = c.entry_count === 1 ? '1 signed up' : `${c.entry_count} signed up`
  switch (c.status) {
    case 'live':      return c.signups_open ? `${people} · Signups open` : people
    case 'scheduled': return c.signups_open ? `Signups open · ${people}` : 'Starting soon'
    case 'paused':    return 'Paused · back soon'
    case 'ended':     return 'See who won'
    case 'draft':     return 'Draft · only you and your operators see this'
    case 'hidden':    return 'Hidden · only you and your operators see this'
  }
}

export default function LiveContestCard({ contest }: { contest: Contest }) {
  const accent = contest.accent_color
  const running = contest.status === 'live'
  const privateToOps = !isPublicOnVenuePage(contest)
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/contest/${contest.id}` as any)}
      style={[styles.card, { borderColor: withAlpha(accent, 0.45), shadowColor: accent }]}
      accessibilityRole="button"
      accessibilityLabel={`${contest.title}, ${statusLabel(contest.status)}. Open the contest.`}
    >
      <View style={[styles.glow, { backgroundColor: withAlpha(accent, 0.1) }]} pointerEvents="none" />
      {contest.logo_url ? (
        <Image source={{ uri: contest.logo_url }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.logo, styles.logoFallback, { backgroundColor: withAlpha(accent, 0.16) }]}>
          <Ionicons name="trophy" size={20} color={accent} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.topRow}>
          <LiveDot color={privateToOps ? '#7A93AC' : accent} still={!running} size={6} />
          <Text style={[styles.status, { color: privateToOps ? '#7A93AC' : accent }]}>
            {statusLabel(contest.status)}
          </Text>
          {contest.presented_by ? (
            <Text style={styles.presented} numberOfLines={1}>· {contest.presented_by}</Text>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>{contest.title}</Text>
        <Text style={styles.sub} numberOfLines={1}>{contest.ticker || subline(contest)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={accent} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 16, borderWidth: 1,
    backgroundColor: '#0A1424', overflow: 'hidden',
    shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  glow: { ...StyleSheet.absoluteFillObject },
  logo: { width: 44, height: 44, borderRadius: 12 },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  status: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  presented: { fontSize: 11, fontWeight: '700', color: '#8EADC7', flexShrink: 1, marginLeft: 4 },
  title: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  sub: { fontSize: 12, color: '#8EADC7' },
})
