import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
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

export default function ZoneCard({ zone, onPress, selected }: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.top}>
        <View style={styles.nameBadge}>
          <Text style={styles.nameInitial}>{zone.name[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{zone.name}</Text>
          {zone.description && (
            <Text style={styles.desc} numberOfLines={2}>{zone.description}</Text>
          )}
        </View>
        {zone.distance_meters != null && (
          <Text style={styles.distance}>{formatDistance(zone.distance_meters)}</Text>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{zone.member_count}</Text>
          <Text style={styles.statLabel}>members</Text>
        </View>
        <View style={styles.statDot} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{zone.post_count}</Text>
          <Text style={styles.statLabel}>posts</Text>
        </View>
        <View style={styles.statDot} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{zone.radius_meters}m</Text>
          <Text style={styles.statLabel}>radius</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 12,
  },
  cardSelected: {
    borderColor: '#29B6F6',
    backgroundColor: '#29B6F608',
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nameBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#29B6F622',
    borderWidth: 1,
    borderColor: '#29B6F644',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nameInitial: { fontSize: 18, fontWeight: '800', color: '#29B6F6' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  desc: { fontSize: 13, color: '#7A93AC', marginTop: 3, lineHeight: 18 },
  distance: { fontSize: 12, color: '#29B6F6', fontWeight: '600', flexShrink: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statNum: { fontSize: 13, fontWeight: '700', color: '#8EADC7' },
  statLabel: { fontSize: 12, color: '#4A6580' },
  statDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#1A2E4A' },
})
