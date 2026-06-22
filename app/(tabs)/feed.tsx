import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native'
import { TAB_SAFE_BOTTOM } from './_layout'
import { supabase } from '@/lib/supabase'
import { fetchLikedPostIds } from '@/lib/posts'
import PostCard from '@/components/PostCard'
import type { Post } from '@/components/PostCard'

export default function FeedScreen() {
  const [posts, setPosts]       = useState<Post[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('zone_posts')
      .select(`
        id, content, media_url, like_count, comment_count, created_at,
        zones(id, name),
        profiles(id, display_name, username, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    const raw = (data ?? []) as unknown as Post[]

    // Hydrate liked status in a single query
    const likedIds = await fetchLikedPostIds(raw.map((p) => p.id))
    setPosts(raw.map((p) => ({ ...p, is_liked: likedIds.has(p.id) })))
  }

  useEffect(() => { load() }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <Text style={styles.headerSub}>Posts from your zones</Text>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />
        }
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📡</Text>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySub}>Join a zone to see posts from people nearby.</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#f8fafc' },
  headerSub: { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  list: {
    paddingHorizontal: 16,
    paddingBottom: TAB_SAFE_BOTTOM,
    gap: 12,
    ...Platform.select({
      web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
      default: {},
    }),
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
})
