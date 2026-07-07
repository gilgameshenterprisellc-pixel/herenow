import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Image } from 'react-native'
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

function formatEventTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMin = Math.round((d.getTime() - now) / 60000)
  if (diffMin < 60) return `in ${diffMin}m`
  const hrs = d.getHours() % 12 || 12
  const mins = d.getMinutes().toString().padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'pm' : 'am'
  return `${hrs}:${mins}${ampm}`
}

export default function ZoneCard({ zone, onPress, selected }: Props) {
  const pressScale = useRef(new Animated.Value(1)).current
  const isClosed = zone.is_temporarily_closed
  const isLive = !isClosed && (zone.member_count ?? 0) > 0

  // Show next event only if it starts within 6 hours
  const nextEventSoon = !isClosed && zone.next_event_starts_at
    ? (new Date(zone.next_event_starts_at).getTime() - Date.now()) < 6 * 60 * 60 * 1000
    : false

  const onPressIn  = () => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()

  return (
    <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={isClosed ? styles.closedWrap : undefined}>
      <Animated.View
        style={[
          styles.card,
          isClosed && styles.cardClosed,
          selected && !isClosed && styles.cardSelected,
          { transform: [{ scale: pressScale }] },
          Platform.OS === 'web' && selected && !isClosed ? (styles.cardSelectedShadow as any) : null,
        ]}
      >
        {selected && !isClosed && <View style={styles.accentLine} pointerEvents="none" />}

        <View style={styles.top}>
          <View style={[styles.badge, isClosed ? styles.badgeClosed : isLive && styles.badgeLive]}>
            {zone.avatar_url ? (
              <Image source={{ uri: zone.avatar_url }} style={styles.venueAvatar} resizeMode="cover" />
            ) : (
              <Text style={[styles.initial, isClosed ? styles.initialClosed : isLive && styles.initialLive]}>
                {zone.name[0]?.toUpperCase()}
              </Text>
            )}
            {isLive && <View style={styles.pulsePos}><PulseDot /></View>}
          </View>

          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, isClosed && styles.nameClosed]} numberOfLines={1}>{zone.name}</Text>
              {isClosed ? (
                <View style={styles.closedPill}>
                  <Text style={styles.closedPillText}>CLOSED</Text>
                </View>
              ) : isLive && (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              )}
            </View>
            {isClosed ? (
              <Text style={styles.closureMsg} numberOfLines={2}>
                {zone.temporary_closure_message ?? 'Temporarily unavailable'}
              </Text>
            ) : zone.description ? (
              <Text style={styles.desc} numberOfLines={2}>{zone.description}</Text>
            ) : null}
          </View>

          {zone.distance_meters != null && (
            <View style={[styles.distancePill, isClosed && styles.distancePillClosed]}>
              <Text style={[styles.distanceText, isClosed && styles.distanceTextClosed]}>{formatDistance(zone.distance_meters)}</Text>
            </View>
          )}
        </View>

        {!isClosed && (
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
        )}

        {/* Activity preview — hidden when closed */}
        {(isLive || nextEventSoon) && (
          <View style={styles.activityRow}>
            {isLive && (
              <View style={styles.activityPill}>
                <View style={styles.activityDot} />
                <Text style={styles.activityText}>
                  {zone.member_count} {zone.member_count === 1 ? 'person' : 'people'} here right now
                </Text>
              </View>
            )}
            {nextEventSoon && zone.next_event_title && zone.next_event_starts_at && (
              <View style={styles.eventPill}>
                <Text style={styles.eventText}>
                  📅 {zone.next_event_title} · {formatEventTime(zone.next_event_starts_at)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Operating hours */}
        {!!zone.opening_hours && !isClosed && (
          <Text style={styles.hoursText}>🕐 {zone.opening_hours}</Text>
        )}

        {/* Venue chips */}
        {(zone.chips ?? []).length > 0 && (
          <View style={styles.chipsRow}>
            {(zone.chips ?? []).slice(0, 4).map((c) => (
              <View key={c} style={[styles.chip, isClosed && styles.chipClosed]}>
                <Text style={[styles.chipText, isClosed && styles.chipTextClosed]}>{c}</Text>
              </View>
            ))}
            {(zone.chips ?? []).length > 4 && (
              <View style={[styles.chip, isClosed && styles.chipClosed]}>
                <Text style={[styles.chipText, isClosed && styles.chipTextClosed]}>+{(zone.chips ?? []).length - 4}</Text>
              </View>
            )}
          </View>
        )}
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
  cardClosed: { borderColor: '#2A3A4A', backgroundColor: '#090F18' },
  closedWrap: { opacity: 0.65 },
  badgeClosed: { backgroundColor: '#1A2A3A', borderColor: '#2A3A4A' },
  initialClosed: { color: '#3D5A73' },
  nameClosed: { color: '#4A6580' },
  closedPill: {
    backgroundColor: '#2A2A2A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#3A3A3A',
  },
  closedPillText: { fontSize: 9, fontWeight: '900', color: '#5A7A9A', letterSpacing: 1.2 },
  closureMsg: { fontSize: 13, color: '#3D5A73', lineHeight: 18, fontStyle: 'italic' },
  distancePillClosed: { backgroundColor: '#0A1628', borderColor: '#1A2E4A' },
  distanceTextClosed: { color: '#3D5A73' },
  chipClosed: { backgroundColor: '#070E1A', borderColor: '#111F30' },
  chipTextClosed: { color: '#3D5A73' },
  accentLine: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    backgroundColor: '#29B6F6', opacity: 0.9,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  badge: {
    width: 50, height: 50, borderRadius: 15,
    backgroundColor: '#29B6F614', borderWidth: 1.5, borderColor: '#29B6F630',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative',
    overflow: 'hidden',
  },
  venueAvatar: { width: 50, height: 50, borderRadius: 15 },
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
  activityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#22c55e0F', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#22c55e30',
  },
  activityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  activityText: { fontSize: 11, color: '#22c55e', fontWeight: '600' },
  eventPill: {
    backgroundColor: '#29B6F60F', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#29B6F630',
  },
  eventText: { fontSize: 11, color: '#29B6F6', fontWeight: '600' },
  hoursText: { fontSize: 11, color: '#4A6580' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: {
    backgroundColor: '#0A1628', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  chipText: { fontSize: 10, color: '#5A7A9A', fontWeight: '600' },
})
