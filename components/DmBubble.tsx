import { View, Text, StyleSheet } from 'react-native'
import type { DirectMessage } from '@/lib/messages'

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  message: DirectMessage
  currentUserId: string
}

export default function DmBubble({ message, currentUserId }: Props) {
  const isMe = message.sender_id === currentUserId

  return (
    <View style={[styles.row, isMe && styles.rowRight]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.content, isMe && styles.contentMe]}>{message.content}</Text>
        <Text style={[styles.time, isMe && styles.timeMe]}>{timeStr(message.sent_at)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row:      { flexDirection: 'row', marginVertical: 4 },
  rowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 10,
    gap: 3,
  },
  bubbleMe: {
    backgroundColor: '#29B6F6',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: '#0D1B2E',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderBottomLeftRadius: 4,
  },
  content:    { fontSize: 14, color: '#D0E8F5', lineHeight: 18 },
  contentMe:  { color: '#050A15' },
  time:   { fontSize: 10, color: '#7A93AC', alignSelf: 'flex-end' },
  timeMe: { color: '#050A1599' },
})
