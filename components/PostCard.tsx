import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { toggleLike } from '@/lib/posts'

export interface Post {
  id: string
  content: string
  media_url: string | null
  like_count: number
  comment_count: number
  created_at: string
  is_liked?: boolean
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
  onComment?: () => void
}

export default function PostCard({ post, onComment }: Props) {
  const profile   = post.profiles
  const initial   = profile?.display_name?.[0]?.toUpperCase() ?? '?'
  const [liked, setLiked]   = useState(post.is_liked ?? false)
  const [count, setCount]   = useState(post.like_count)
  const [tapping, setTapping] = useState(false)

  const handleLike = async () => {
    if (tapping) return
    setTapping(true)
    const prev = liked
    // Optimistic update
    setLiked(!prev)
    setCount((c) => c + (prev ? -1 : 1))
    const { liked: newLiked } = await toggleLike(post.id)
    // Reconcile if server disagrees
    setLiked(newLiked)
    setCount((c) => {
      if (newLiked === !prev) return c
      return c + (newLiked ? 1 : -1)
    })
    setTapping(false)
  }

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
        <TouchableOpacity style={styles.action} onPress={handleLike} activeOpacity={0.7}>
          <Text style={[styles.actionText, liked && styles.actionLiked]}>
            {liked ? '❤️' : '🤍'} {count}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={onComment} activeOpacity={0.7}>
          <Text style={styles.actionText}>💬 {post.comment_count}</Text>
        </TouchableOpacity>
      </View>
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
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#29B6F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#050A15' },
  meta: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  username: { fontSize: 12, color: '#7A93AC', marginTop: 1 },
  zonePill: {
    backgroundColor: '#29B6F611',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#29B6F622',
  },
  zonePillText: { fontSize: 10, color: '#29B6F6', fontWeight: '600' },
  content: { fontSize: 14, color: '#D0E8F5', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 16 },
  action: { padding: 4 },
  actionText: { fontSize: 13, color: '#7A93AC' },
  actionLiked: { color: '#ef4444' },
})
