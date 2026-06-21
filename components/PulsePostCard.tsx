import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import type { PulsePost } from '@/lib/pulse'
import { deletePulsePost } from '@/lib/pulse'
import ExpiryLabel from './ExpiryLabel'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h`
}

interface Props {
  post: PulsePost
  currentUserId: string
  onDeleted?: () => void
}

export default function PulsePostCard({ post, currentUserId, onDeleted }: Props) {
  const profile = post.profiles
  const initial = profile?.display_name?.[0]?.toUpperCase() ?? '?'
  const isOwn = post.user_id === currentUserId

  const handleDelete = () => {
    Alert.alert('Remove post', 'Remove this Pulse moment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deletePulsePost(post.id)
          onDeleted?.()
        },
      },
    ])
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{profile?.display_name ?? 'Someone'}</Text>
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        </View>
        <ExpiryLabel expiresAt={post.expires_at} />
        {isOwn && (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {post.vibe_tag && (
        <View style={styles.vibeTag}>
          <Text style={styles.vibeTagText}>{post.vibe_tag}</Text>
        </View>
      )}

      {post.content && (
        <Text style={styles.content}>{post.content}</Text>
      )}
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
    gap: 8,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  meta: { flex: 1 },
  name: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  time: { fontSize: 11, color: '#7A93AC' },
  deleteBtn: { padding: 4 },
  deleteText: { fontSize: 13, color: '#7A93AC' },
  vibeTag: {
    backgroundColor: '#a855f718',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#a855f733',
  },
  vibeTagText: { fontSize: 12, color: '#a855f7', fontWeight: '600' },
  content: { fontSize: 14, color: '#D0E8F5', lineHeight: 20 },
})
