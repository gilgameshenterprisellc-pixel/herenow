import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native'
import type { Zone } from '@/lib/zones'

interface Props {
  zone: Zone
  onPress: () => void
  selected?: boolean
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

function PulseDot() {
  const scale   = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 2.4, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return (
    <View style={dot.wrap}>
      <Animated.View style={[dot.ring, { transform: [{ scale }], opacity }]} />
      <View style={dot.core} />
    </View>
  )
}

const dot = StyleSheet.create({
  wrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  core: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22c55e', borderWidth: 1, borderColor: '#050A15' },
})

export default function ZoneCard({ zone, onPress, selected }: Props) {
  const pressScale = useRef(new Animated.Value(1)).current
  const isLive = (zone.member_count ?? 0) > 0

  const onPressIn  = () => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()

  return (
    <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.card,
          selected && styles.cardSelected,
          { transform: [{ scale: pressScale }] },
          Platform.OS === 'web' && selected ? (styles.cardSelectedShadow as any) : null,
        ]}
      >
        {selected && <View style={styles.accentLine} pointerEvents="none" />}

        <View style={styles.top}>
          <View style={[styles.badge, isLive && styles.badgeLive]}>
            <Text style={[styles.initial, isLive && styles.initialLive]}>
              {zone.name[0]?.toUpperCase()}
            </Text>
            {isLive && <View style={styles.pulsePos}><PulseDot /></View>}
          </View>

          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{zone.name}</Text>
              {isLive && (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              )}
            </View>
            {zone.description && (
              <Text style={styles.desc} numberOfLines={2}>{zone.description}</Text>
            )}
          </View>

          {zone.distance_meters != null && (
            <View style={styles.distancePill}>
              <Text style={styles.distanceText}>{formatDistance(zone.distance_meters)}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, isLive && styles.statNumLive]}>{zone.member_count}</Text>
            <Text style={styles.statLabel}>here now</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{zone.post_count}</Text>
            <Text style={styles.statLabel}>posts</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{zone.radius_meters}m</Text>
            <Text style={styles.statLabel}>radius</Text>
          </View>
          <View style={styles.heatTrack}>
            <View
              style={[
                styles.heatFill,
                { width: `${Math.min(((zone.member_count ?? 0) / 30) * 100, 100)}%` as any },
                isLive && styles.heatFillLive,
              ]}
            />
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0B1828',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 14,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 2px 16px rgba(0,0,0,0.35)' } as any,
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
    }),
  },
  cardSelected: { borderColor: '#29B6F6', backgroundColor: '#091B2F' },
  cardSelectedShadow: { boxShadow: '0 0 0 1.5px #29B6F6, 0 6px 28px rgba(41,182,246,0.18)' },
  accentLine: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    backgroundColor: '#29B6F6', opacity: 0.9,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  badge: {
    width: 50, height: 50, borderRadius: 15,
    backgroundColor: '#29B6F614', borderWidth: 1.5, borderColor: '#29B6F630',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative',
  },
  badgeLive: { backgroundColor: '#29B6F620', borderColor: '#29B6F655' },
  initial: { fontSize: 20, fontWeight: '800', color: '#29B6F6' },
  initialLive: { color: '#e0f5ff' },
  pulsePos: { position: 'absolute', top: -5, right: -5 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '800', color: '#f0f8ff', flex: 1, letterSpacing: -0.3 },
  livePill: {
    backgroundColor: '#22c55e14', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#22c55e40',
  },
  livePillText: { fontSize: 9, fontWeight: '900', color: '#22c55e', letterSpacing: 1.2 },
  desc: { fontSize: 13, color: '#6B89A0', lineHeight: 18 },
  distancePill: {
    backgroundColor: '#29B6F60C', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, borderColor: '#29B6F628', flexShrink: 0, alignSelf: 'flex-start',
  },
  distanceText: { fontSize: 11, color: '#29B6F6', fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statNum: { fontSize: 13, fontWeight: '700', color: '#7A93AC' },
  statNumLive: { color: '#22c55e' },
  statLabel: { fontSize: 11, color: '#3D5A73' },
  divider: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#1A2E4A' },
  heatTrack: { flex: 1, height: 3, backgroundColor: '#0D1B2E', borderRadius: 2, overflow: 'hidden', marginLeft: 6 },
  heatFill: { height: '100%' as any, backgroundColor: '#1A3A5A', borderRadius: 2 },
  heatFillLive: { backgroundColor: '#22c55e' },
})
