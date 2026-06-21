import { View, Text, StyleSheet } from 'react-native'
import type { Badge } from '@/lib/badges'

const CATEGORY_COLOR: Record<string, string> = {
  courage:     '#f43f5e',
  kindness:    '#22c55e',
  exploration: '#3b82f6',
  connection:  '#a855f7',
  presence:    '#29B6F6',
}

interface Props {
  badge: Badge
  earned?: boolean
  earnedAt?: string
}

export default function BadgeCard({ badge, earned = false, earnedAt }: Props) {
  const color = CATEGORY_COLOR[badge.category] ?? '#7A93AC'

  return (
    <View style={[styles.card, earned && { borderColor: color + '44' }, !earned && styles.locked]}>
      <View style={[styles.iconBox, { backgroundColor: color + '18' }]}>
        <Text style={styles.icon}>{badge.icon ?? '🏅'}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, !earned && styles.nameLocked]}>{badge.name}</Text>
        <Text style={styles.desc} numberOfLines={2}>{badge.description}</Text>
        {earned && earnedAt && (
          <Text style={[styles.earnedAt, { color }]}>
            Earned {new Date(earnedAt).toLocaleDateString()}
          </Text>
        )}
        {!earned && <Text style={styles.lockedLabel}>Not yet earned</Text>}
      </View>
      <View style={[styles.dot, { backgroundColor: earned ? color : '#1A2E4A' }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locked: { opacity: 0.5 },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 24 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  nameLocked: { color: '#7A93AC' },
  desc: { fontSize: 12, color: '#7A93AC', lineHeight: 16 },
  earnedAt: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  lockedLabel: { fontSize: 11, color: '#4A6580', marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
})
