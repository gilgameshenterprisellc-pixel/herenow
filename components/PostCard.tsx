import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

export interface Post {
  id: string
  content: string
  media_url: string | null
  like_count: number
  comment_count: number
  created_at: string
  zones: { id: string; name: string } | null
  profiles: {
    id: string
    display_name: string
    username: string
    avatar_url: string | null
  } | null
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

interface Props {
  post: Post
}

export default function PostCard({ post }: Props) {
  const profile = post.profiles
  const initial = profile?.display_name?.[0]?.toUpperCase() ?? '?'

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{profile?.display_name ?? 'Unknown'}</Text>
          <Text style={styles.username}>@{profile?.username} · {timeAgo(post.created_at)}</Text>
        </View>
        {post.zones && (
          <View style={styles.zonePill}>
            <Text style={styles.zonePillText}>📍 {post.zones.name}</Text>
          </View>
        )}
      </View>

      <Text style={styles.content}>{post.content}</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action}>
          <Text style={styles.actionText}>❤️ {post.like_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action}>
          <Text style={styles.actionText}>💬 {post.comment_count}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  meta: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  username: { fontSize: 12, color: '#64748b', marginTop: 1 },
  zonePill: {
    backgroundColor: '#f59e0b11',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#f59e0b22',
  },
  zonePillText: { fontSize: 10, color: '#f59e0b', fontWeight: '600' },
  content: { fontSize: 14, color: '#e2e8f0', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 16 },
  action: { padding: 4 },
  actionText: { fontSize: 13, color: '#64748b' },
})
