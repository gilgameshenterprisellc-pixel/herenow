import { View, Text, Image, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { VenueAnnouncement } from '@/lib/broadcasts'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// A venue announcement shown at the top of its Pulse tonight. Styled like the
// venue's own Pulse posts (amber) so guests read it as the room talking.
export default function VenueAnnouncementCard({ announcement, venueName }: {
  announcement: VenueAnnouncement
  venueName: string
}) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <Ionicons name="megaphone" size={16} color="#050A15" />
        </View>
        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{venueName}</Text>
            <Text style={styles.tag}>ANNOUNCEMENT</Text>
          </View>
          <Text style={styles.time}>{timeAgo(announcement.publish_at)}</Text>
        </View>
      </View>
      {announcement.image_url ? (
        <Image source={{ uri: announcement.image_url }} style={styles.media} resizeMode="cover" />
      ) : null}
      <Text style={styles.message}>{announcement.message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#14110A', borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1.5, borderColor: '#f59e0b', marginBottom: 10, overflow: 'hidden',
  },
  top:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f59e0b',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  meta:    { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:    { fontSize: 13, fontWeight: '700', color: '#f8fafc', flexShrink: 1 },
  tag: {
    fontSize: 9, fontWeight: '900', color: '#f59e0b', letterSpacing: 1,
    backgroundColor: '#f59e0b20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1,
  },
  time:    { fontSize: 11, color: '#7A93AC' },
  media: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: '#07101F',
  },
  message: { fontSize: 14, color: '#D0E8F5', lineHeight: 20 },
})
