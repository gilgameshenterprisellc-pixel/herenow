import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { VenueEvent } from '@/lib/events'

const EVENT_TYPE_EMOJI: Record<string, string> = {
  music:       '',
  trivia:      '',
  happy_hour:  '',
  sports:      '',
  comedy:      '',
  karaoke:     '',
  general:     '',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

interface Props {
  event: VenueEvent
  onToggleRsvp?: (event: VenueEvent) => void
}

export default function EventCard({ event, onToggleRsvp }: Props) {
  const emoji = EVENT_TYPE_EMOJI[event.event_type] ?? ''
  const isPast = event.ends_at ? new Date(event.ends_at) < new Date() : false

  return (
    <View style={[styles.card, isPast && styles.cardPast]}>
      <View style={styles.top}>
        <View style={styles.emojiBox}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.time}>
            {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
            {event.ends_at && ` – ${formatTime(event.ends_at)}`}
          </Text>
        </View>
        <View style={styles.rsvpBox}>
          <Text style={styles.rsvpCount}>{event.rsvp_count}</Text>
          <Text style={styles.rsvpLabel}>going</Text>
        </View>
      </View>

      {event.description && (
        <Text style={styles.desc} numberOfLines={2}>{event.description}</Text>
      )}

      {!isPast && onToggleRsvp && (
        <TouchableOpacity
          style={[styles.rsvpBtn, event.user_rsvpd && styles.rsvpBtnActive]}
          onPress={() => onToggleRsvp(event)}
          activeOpacity={0.8}
        >
          <Text style={[styles.rsvpBtnText, event.user_rsvpd && styles.rsvpBtnTextActive]}>
            {event.user_rsvpd ? '✓ Going' : 'RSVP'}
          </Text>
        </TouchableOpacity>
      )}

      {isPast && <Text style={styles.pastLabel}>Event ended</Text>}
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
    gap: 10,
  },
  cardPast: { opacity: 0.5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emojiBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#050A15',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emoji: { fontSize: 22 },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  time: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  rsvpBox: { alignItems: 'center' },
  rsvpCount: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  rsvpLabel: { fontSize: 10, color: '#7A93AC' },
  desc: { fontSize: 13, color: '#8EADC7', lineHeight: 18 },
  rsvpBtn: {
    borderWidth: 1,
    borderColor: '#29B6F6',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  rsvpBtnActive: { backgroundColor: '#29B6F6' },
  rsvpBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 14 },
  rsvpBtnTextActive: { color: '#050A15' },
  pastLabel: { fontSize: 12, color: '#7A93AC', textAlign: 'center' },
})
