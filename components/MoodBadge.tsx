import { View, Text, StyleSheet } from 'react-native'
import type { MoodMode } from '@/lib/sessions'

const MODE_CONFIG: Record<MoodMode, { label: string; color: string; bg: string }> = {
  open:       { label: 'Open',       color: '#22c55e', bg: '#22c55e18' },
  selective:  { label: 'Selective',  color: '#29B6F6', bg: '#29B6F618' },
  not_today:  { label: 'Not Today',  color: '#7A93AC', bg: '#7A93AC18' },
}

interface Props {
  mode: MoodMode
  size?: 'sm' | 'md'
}

export default function MoodBadge({ mode, size = 'sm' }: Props) {
  const cfg = MODE_CONFIG[mode]
  if (!cfg) return null

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.color + '44' }, size === 'md' && styles.md]}>
      <Text style={[styles.label, { color: cfg.color }, size === 'md' && styles.labelMd]}>
        {cfg.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  md: { paddingHorizontal: 10, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '600' },
  labelMd: { fontSize: 13 },
})
