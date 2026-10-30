import { useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet } from 'react-native'
import { fetchUniversalSlots } from '@/lib/broadcasts'
import { UNIVERSAL_FEED_WEEKLY_LIMIT } from '@/lib/universalFeed'
import { formatDateTime } from '@/components/DateTimeField'

// "Also post to the Nashville feed": a broadcast to everyone in the venue's city,
// not just its followers and tonight's guests. 3 per rolling 7 days (Jacob, Oct 29).
// `refreshKey` changes after each send so the count stays current.
export default function UniversalFeedToggle({ zoneId, cityName, audience, value, onChange, refreshKey }: {
  zoneId: string | null
  cityName: string | null
  audience: 'all' | 'subscribers'
  value: boolean
  onChange: (v: boolean) => void
  refreshKey: number
}) {
  const [slots, setSlots] = useState<{ left: number; nextOpensAt: Date | null } | null>(null)

  useEffect(() => {
    if (!zoneId || !cityName) return
    let cancelled = false
    fetchUniversalSlots(zoneId).then((s) => { if (!cancelled) setSlots(s) })
    return () => { cancelled = true }
  }, [zoneId, cityName, refreshKey])

  const noneLeft = slots?.left === 0
  const subscribersOnly = audience === 'subscribers'
  const disabled = !cityName || noneLeft || subscribersOnly

  // Never leave it on in a state the database would refuse.
  useEffect(() => { if (disabled && value) onChange(false) }, [disabled, value, onChange])

  let sub: string
  if (!cityName) sub = 'Your venue isn\'t in a city with a Universal Feed yet.'
  else if (subscribersOnly) sub = 'Only "All followers" posts can go to the city feed.'
  else if (noneLeft) sub = `All ${UNIVERSAL_FEED_WEEKLY_LIMIT} used this week. Next one opens ${slots?.nextOpensAt ? formatDateTime(slots.nextOpensAt) : 'soon'}.`
  else sub = `Everyone in ${cityName} sees it, not just your followers. ${slots ? `${slots.left} of ${UNIVERSAL_FEED_WEEKLY_LIMIT}` : `Up to ${UNIVERSAL_FEED_WEEKLY_LIMIT}`} left this week.`

  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.text}>
        <Text style={styles.label}>Also post to the {cityName ?? 'city'} feed</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
        thumbColor="#f8fafc"
        accessibilityLabel={`Also post to the ${cityName ?? 'city'} feed`}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  rowDisabled: { opacity: 0.6 },
  text:  { flex: 1, gap: 2 },
  label: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  sub:   { fontSize: 12, color: '#7A93AC', lineHeight: 17 },
})
