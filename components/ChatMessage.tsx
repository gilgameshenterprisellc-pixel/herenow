import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ChatMessage as ChatMsg } from '@/lib/chat'

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  message: ChatMsg
  currentUserId: string
  // Stable anonymous label for the sender (e.g. "Guest 3"). Venue chat is
  // anonymous — real names are never shown. Falls back to "Guest" if missing.
  senderLabel?: string
  // Opens the Report / Block (someone else's message) or Delete (your own) menu.
  // The button is always visible rather than hidden behind a long-press, so it
  // can be found without being told where to look.
  onOpenMenu?: (message: ChatMsg) => void
}

export default function ChatMessage({ message, currentUserId, senderLabel, onOpenMenu }: Props) {
  const isMe = message.user_id === currentUserId
  const label = senderLabel ?? 'Guest'
  const avatarText = label.match(/\d+/)?.[0] ?? '·'

  const menuBtn = onOpenMenu ? (
    <TouchableOpacity
      onPress={() => onOpenMenu(message)}
      style={styles.menuBtn}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={isMe ? 'Message options' : 'Report or block this message'}
    >
      <Ionicons name="ellipsis-horizontal" size={16} color="#7A93AC" />
    </TouchableOpacity>
  ) : null

  // A message from the venue itself — official, so it reads distinctly.
  if (message.is_venue_msg) {
    return (
      <View style={styles.rowVenue}>
        <View style={styles.bubbleVenue}>
          <View style={styles.venueHeader}>
            <View style={styles.venueBadge}>
              <Text style={styles.venueBadgeText}>VENUE</Text>
            </View>
            {menuBtn}
          </View>
          <Text style={styles.contentVenue}>{message.content}</Text>
          <Text style={styles.timeVenue}>{timeStr(message.created_at)}</Text>
        </View>
      </View>
    )
  }

  if (isMe) {
    return (
      <View style={styles.rowRight}>
        {menuBtn}
        <View style={styles.bubbleRight}>
          <Text style={styles.contentRight}>{message.content}</Text>
          <Text style={styles.timeRight}>{timeStr(message.created_at)}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.rowLeft}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{avatarText}</Text>
      </View>
      <View style={styles.bubbleLeft}>
        <Text style={styles.sender}>{label}</Text>
        <Text style={styles.contentLeft}>{message.content}</Text>
        <Text style={styles.timeLeft}>{timeStr(message.created_at)}</Text>
      </View>
      {menuBtn}
    </View>
  )
}

const styles = StyleSheet.create({
  rowRight: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginVertical: 3 },
  rowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  menuBtn:  { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A2E4A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#8EADC7' },
  bubbleRight: {
    backgroundColor: '#29B6F6',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 10,
    maxWidth: '75%',
    gap: 2,
  },
  bubbleLeft: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 10,
    maxWidth: '75%',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 2,
  },
  contentRight: { fontSize: 14, color: '#050A15', lineHeight: 18 },
  contentLeft:  { fontSize: 14, color: '#D0E8F5', lineHeight: 18 },
  sender: { fontSize: 11, color: '#7A93AC', fontWeight: '600', marginBottom: 2 },
  timeRight: { fontSize: 10, color: '#050A1599', alignSelf: 'flex-end' },
  timeLeft:  { fontSize: 10, color: '#7A93AC',   alignSelf: 'flex-end' },
  rowVenue: { marginVertical: 4, alignItems: 'stretch' },
  bubbleVenue: {
    backgroundColor: '#F59E0B18',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F59E0B55',
    gap: 3,
  },
  venueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  venueBadge: { alignSelf: 'flex-start', backgroundColor: '#F59E0B', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  venueBadgeText: { fontSize: 9, fontWeight: '900', color: '#050A15', letterSpacing: 0.5 },
  contentVenue: { fontSize: 14, color: '#FCE4B6', lineHeight: 18, fontWeight: '500' },
  timeVenue: { fontSize: 10, color: '#F59E0B99', alignSelf: 'flex-end' },
})
