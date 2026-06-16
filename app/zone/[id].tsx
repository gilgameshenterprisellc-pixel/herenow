import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import type { Post } from '@/components/PostCard'

interface ZoneDetail {
  id: string
  name: string
  description: string | null
  radius_meters: number
  member_count: number
  post_count: number
}

export default function ZoneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [zone, setZone] = useState<ZoneDetail | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [newPost, setNewPost] = useState('')
  const [isMember, setIsMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: z }, { data: p }, { data: m }] = await Promise.all([
        supabase.from('zones').select('id, name, description, radius_meters, member_count, post_count').eq('id', id).single(),
        supabase
          .from('zone_posts')
          .select('id, content, media_url, like_count, comment_count, created_at, zones(id, name), profiles(id, display_name, username, avatar_url)')
          .eq('zone_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('zone_members').select('id').eq('zone_id', id).eq('user_id', user.id).maybeSingle(),
      ])

      setZone(z)
      setPosts((p as Post[]) ?? [])
      setIsMember(!!m)
      setLoading(false)
    }
    load()
  }, [id])

  const handleJoin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('zone_members').upsert({ zone_id: id, user_id: user.id }, { onConflict: 'zone_id,user_id' })
    setIsMember(true)
  }

  const handlePost = async () => {
    if (!newPost.trim() || posting) return
    setPosting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: post } = await supabase
      .from('zone_posts')
      .insert({ zone_id: id, user_id: user.id, content: newPost.trim() })
      .select('id, content, media_url, like_count, comment_count, created_at, zones(id, name), profiles(id, display_name, username, avatar_url)')
      .single()

    if (post) setPosts((prev) => [post as Post, ...prev])
    setNewPost('')
    setPosting(false)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#f59e0b" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.zoneName}>{zone?.name}</Text>
          <Text style={styles.zoneMeta}>
            {zone?.member_count} member{zone?.member_count !== 1 ? 's' : ''} · {zone?.radius_meters}m radius
          </Text>
        </View>
        {!isMember && (
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoin}>
            <Text style={styles.joinText}>Join</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Posts */}
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySub}>Be the first to post in this zone.</Text>
          </View>
        }
      />

      {/* Compose */}
      {isMember && (
        <View style={styles.compose}>
          <TextInput
            style={styles.composeInput}
            placeholder="What's happening here?"
            placeholderTextColor="#475569"
            value={newPost}
            onChangeText={setNewPost}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.postBtn, (!newPost.trim() || posting) && styles.postBtnDisabled]}
            onPress={handlePost}
            disabled={!newPost.trim() || posting}
          >
            {posting ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  headerInfo: { flex: 1 },
  zoneName: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  zoneMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  joinBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  joinText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#64748b' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 10,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
  },
  composeInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    color: '#f8fafc',
    fontSize: 14,
    maxHeight: 100,
  },
  postBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
})
