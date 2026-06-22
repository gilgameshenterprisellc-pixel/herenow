import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAB_SAFE_BOTTOM } from './_layout'
import { supabase } from '@/lib/supabase'
import { fetchLikedPostIds } from '@/lib/posts'
import PostCard from '@/components/PostCard'
import AnimatedBackground from '@/components/AnimatedBackground'
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
      <AnimatedBackground />
      <View style={styles.headerWrap}>
        <View style={styles.accentLine} />
        <View style={styles.header}>
          <Text style={styles.brand}>HERENOW</Text>
          <Text style={styles.headerTitle}>Feed</Text>
          <Text style={styles.headerSub}>What's happening right now</Text>
        </View>
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
            <View style={styles.emptyIcon}>
              <Ionicons name="radio-outline" size={32} color="#29B6F6" />
            </View>
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
  headerWrap: { backgroundColor: '#060D1A', borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  accentLine: {
    height: 2,
    backgroundColor: '#29B6F6',
    ...Platform.select({
      web: { boxShadow: '0 0 12px rgba(41,182,246,0.8), 0 0 24px rgba(41,182,246,0.4)' } as any,
      default: {},
    }),
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 2,
    ...Platform.select({
      web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
      default: {},
    }),
  },
  brand: {
    fontSize: 10,
    fontWeight: '800',
    color: '#29B6F6',
    letterSpacing: 3,
    marginBottom: 4,
    ...Platform.select({
      web: { textShadow: '0 0 8px rgba(41,182,246,0.6)' } as any,
      default: {},
    }),
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.5 },
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
  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#29B6F610', borderWidth: 1, borderColor: '#29B6F620', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
})
