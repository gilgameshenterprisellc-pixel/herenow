import { useEffect, useState } from 'react'
import { Text, StyleSheet } from 'react-native'

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m left`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h left`
  return `${Math.floor(hrs / 24)}d left`
}

interface Props {
  expiresAt: string
  style?: any
  prefix?: string
}

export default function ExpiryLabel({ expiresAt, style, prefix }: Props) {
  const [label, setLabel] = useState(timeUntil(expiresAt))

  useEffect(() => {
    setLabel(timeUntil(expiresAt))
    const interval = setInterval(() => setLabel(timeUntil(expiresAt)), 60000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const isExpiringSoon = new Date(expiresAt).getTime() - Date.now() < 2 * 60 * 60 * 1000

  return (
    <Text style={[styles.label, isExpiringSoon && styles.warn, style]}>
      ⏱ {prefix ? `${prefix} · ` : ''}{label}
    </Text>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 11, color: '#7A93AC', fontWeight: '500' },
  warn:  { color: '#ef4444' },
})
