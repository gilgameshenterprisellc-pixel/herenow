import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import type { Post } from '@/components/PostCard'

export default function FeedScreen() {
  const [posts, setPosts] = useState<Post[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Posts from zones the user is a member of
    const { data } = await supabase
      .from('zone_posts')
      .select(`
        id, content, media_url, like_count, comment_count, created_at,
        zones(id, name),
        profiles(id, display_name, username, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    setPosts((data as Post[]) ?? [])
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />
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
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#f8fafc' },
  headerSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingHorizontal: 32 },
})
