import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { Zone } from '@/lib/zones'

interface Props {
  zone: Zone
  onPress: () => void
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

export default function ZoneCard({ zone, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
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
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nameBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f59e0b22',
    borderWidth: 1,
    borderColor: '#f59e0b44',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nameInitial: { fontSize: 18, fontWeight: '800', color: '#f59e0b' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  desc: { fontSize: 13, color: '#64748b', marginTop: 3, lineHeight: 18 },
  distance: { fontSize: 12, color: '#f59e0b', fontWeight: '600', flexShrink: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statNum: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  statLabel: { fontSize: 12, color: '#475569' },
  statDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#334155' },
})
