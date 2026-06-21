import { View, Text, StyleSheet } from 'react-native'

interface Props {
  count: number
  capacity?: number
}

function getHeatLabel(ratio: number): { label: string; color: string } {
  if (ratio === 0)    return { label: 'Empty',      color: '#1A2E4A' }
  if (ratio < 0.2)   return { label: 'Quiet',       color: '#3b82f6' }
  if (ratio < 0.45)  return { label: 'Filling up',  color: '#22c55e' }
  if (ratio < 0.7)   return { label: 'Buzzing',     color: '#29B6F6' }
  if (ratio < 0.9)   return { label: 'Packed',      color: '#f97316' }
  return               { label: '🔥 On fire',       color: '#ef4444' }
}

export default function HeatBar({ count, capacity = 50 }: Props) {
  const ratio = Math.min(count / capacity, 1)
  const { label, color } = getHeatLabel(ratio)
  const pct = Math.round(ratio * 100)

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
