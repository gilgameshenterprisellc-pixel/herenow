import { View, Text, StyleSheet } from 'react-native'
import { crowdBand } from '@/lib/venueStatus'

interface Props {
  count: number
  capacity?: number | null
}

export default function HeatBar({ count, capacity }: Props) {
  // Bands live in lib/venueStatus so this bar and the map pin cannot disagree.
  const { label, color, fillPct: pct } = crowdBand(count, capacity)

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.countText}>{count} here now</Text>
        <Text style={[styles.label, { color }]}>{label}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countText: { fontSize: 13, color: '#8EADC7', fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '700' },
  track: {
    height: 6,
    backgroundColor: '#1A2E4A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 4,
  },
})
