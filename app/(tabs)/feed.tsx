import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { TAB_SAFE_BOTTOM } from './_layout'
import { supabase } from '@/lib/supabase'
import { fetchLikedPostIds } from '@/lib/posts'
import { fetchMyVenues, type VenueSubscription } from '@/lib/venueSubscriptions'
import PostCard from '@/components/PostCard'
import AnimatedBackground from '@/components/AnimatedBackground'
import type { Post } from '@/components/PostCard'

interface VenueFeedItem {
  id: string
  zone_id: string
  zone_name: string
  type: 'promotion' | 'announcement'
  title?: string
  description?: string
  message?: string
  discount_label?: string
  created_at: string
}

export default function FeedScreen() {
  const [posts, setPosts]           = useState<Post[]>([])
  const [myVenues, setMyVenues]     = useState<VenueSubscription[]>([])
  const [venueFeed, setVenueFeed]   = useState<VenueFeedItem[]>([])
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
    const likedIds = await fetchLikedPostIds(raw.map((p) => p.id))
    setPosts(raw.map((p) => ({ ...p, is_liked: likedIds.has(p.id) })))

    // Subscribed venues
    const subs = await fetchMyVenues()
    setMyVenues(subs)

    if (subs.length > 0) {
      const zoneIds = subs.map((s) => s.zone_id)

      const [{ data: promos }, { data: annos }] = await Promise.all([
        supabase
          .from('venue_promotions')
          .select('id, zone_id, title, description, discount_label, created_at, zones(name)')
          .in('zone_id', zoneIds)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('venue_announcements')
          .select('id, zone_id, message, created_at, zones(name)')
          .in('zone_id', zoneIds)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      // Log promo views (fire-and-forget, deduplicated by UNIQUE constraint)
      const { data: { user: feedUser } } = await supabase.auth.getUser()
      if (feedUser && (promos ?? []).length > 0) {
        const viewRows = (promos ?? []).map((p: any) => ({
          promotion_id: p.id,
          zone_id:      p.zone_id,
          user_id:      feedUser.id,
        }))
        supabase.from('promo_views').upsert(viewRows, { onConflict: 'promotion_id,user_id', ignoreDuplicates: true }).then(() => {})
      }

      const promoItems: VenueFeedItem[] = (promos ?? []).map((p: any) => ({
        id:             `promo-${p.id}`,
        zone_id:        p.zone_id,
        zone_name:      p.zones?.name ?? 'Venue',
        type:           'promotion' as const,
        title:          p.title,
        description:    p.description,
        discount_label: p.discount_label,
        created_at:     p.created_at,
      }))

      const annoItems: VenueFeedItem[] = (annos ?? []).map((a: any) => ({
        id:         `anno-${a.id}`,
        zone_id:    a.zone_id,
        zone_name:  a.zones?.name ?? 'Venue',
        type:       'announcement' as const,
        message:    a.message,
        created_at: a.created_at,
      }))

      setVenueFeed(
        [...promoItems, ...annoItems]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 30)
      )
    } else {
      setVenueFeed([])
    }
  }

  useEffect(() => { load() }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
  }

  const webCenter = Platform.select({
    web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
    default: {},
  })

  const header = (
    <>
      {myVenues.length > 0 && (
        <View style={styles.venuesSection}>
          <Text style={styles.sectionLabel}>MY VENUES</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.venuesList}
          >
            {myVenues.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={styles.venueChip}
                onPress={() => router.push(`/zone/${v.zone_id}` as any)}
              >
                <Text style={styles.venueChipEmoji}>🏢</Text>
                <Text style={styles.venueChipName} numberOfLines={1}>
                  {v.zones?.name ?? 'Venue'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {venueFeed.length > 0 && (
        <View style={styles.venueFeedSection}>
          <Text style={styles.sectionLabel}>FROM YOUR VENUES</Text>
          {venueFeed.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.venueFeedCard, item.type === 'announcement' && styles.venueFeedCardAnnouncement]}
              onPress={() => router.push(`/zone/${item.zone_id}` as any)}
              activeOpacity={0.85}
            >
              <View style={styles.venueFeedHeader}>
                <Text style={styles.venueFeedEmoji}>
                  {item.type === 'announcement' ? '📣' : '🏷️'}
                </Text>
                <View style={styles.venueFeedMeta}>
                  <Text style={styles.venueFeedZone}>{item.zone_name}</Text>
                  <Text style={styles.venueFeedTime}>{timeAgo(item.created_at)}</Text>
                </View>
                <View style={[styles.venueFeedBadge, item.type === 'announcement' ? styles.badgeAnnouncement : styles.badgePromo]}>
                  <Text style={[styles.venueFeedBadgeText, item.type === 'announcement' ? styles.badgeAnnoText : styles.badgePromoText]}>
                    {item.type === 'announcement' ? 'Announcement' : 'Promo'}
                  </Text>
                </View>
              </View>
              {item.type === 'promotion' && item.title && (
                <Text style={styles.venueFeedTitle}>{item.title}</Text>
              )}
              {item.discount_label && (
                <View style={styles.discountPill}>
                  <Text style={styles.discountText}>{item.discount_label}</Text>
                </View>
              )}
              {(item.description || item.message) && (
                <Text style={styles.venueFeedDesc}>{item.description ?? item.message}</Text>
              )}
              <Text style={styles.venueFeedCta}>Tap to visit →</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {posts.length > 0 && (
        <Text style={styles.sectionLabel}>DISCOVERY</Text>
      )}
    </>
  )

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <View style={styles.headerWrap}>
        <View style={styles.accentLine} />
        <View style={[styles.header, webCenter]}>
          <Text style={styles.brand}>HERENOW</Text>
          <Text style={styles.headerTitle}>Feed</Text>
          <Text style={styles.headerSub}>What's happening right now</Text>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, webCenter]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />
        }
        ListHeaderComponent={header}
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          myVenues.length === 0 && venueFeed.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="radio-outline" size={32} color="#29B6F6" />
              </View>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>Join a zone to see posts — or follow a venue to see their updates here.</Text>
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#050A15' },
  headerWrap:  { backgroundColor: '#060D1A', borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  accentLine: {
    height: 2, backgroundColor: '#29B6F6',
    ...Platform.select({ web: { boxShadow: '0 0 12px rgba(41,182,246,0.8), 0 0 24px rgba(41,182,246,0.4)' } as any, default: {} }),
  },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 2 },
  brand: {
    fontSize: 10, fontWeight: '800', color: '#29B6F6', letterSpacing: 3, marginBottom: 4,
    ...Platform.select({ web: { textShadow: '0 0 8px rgba(41,182,246,0.6)' } as any, default: {} }),
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  list:        { paddingHorizontal: 16, paddingBottom: TAB_SAFE_BOTTOM, gap: 12, paddingTop: 12 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#7A93AC',
    letterSpacing: 1.5, marginBottom: 6, marginTop: 4,
  },
  venuesSection: { gap: 8, marginBottom: 8 },
  venuesList:    { gap: 8, flexDirection: 'row', paddingBottom: 4 },
  venueChip: {
    backgroundColor: '#0D1B2E', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#29B6F630',
  },
  venueChipEmoji: { fontSize: 14 },
  venueChipName:  { fontSize: 13, fontWeight: '700', color: '#f8fafc', maxWidth: 100 },
  venueFeedSection: { gap: 8, marginBottom: 12 },
  venueFeedCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#29B6F625', gap: 8,
  },
  venueFeedCardAnnouncement: { borderColor: '#f59e0b25' },
  venueFeedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  venueFeedEmoji:  { fontSize: 20 },
  venueFeedMeta:   { flex: 1, gap: 1 },
  venueFeedZone:   { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  venueFeedTime:   { fontSize: 11, color: '#7A93AC' },
  venueFeedBadge:  { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgePromo:         { backgroundColor: '#29B6F610', borderColor: '#29B6F630' },
  badgeAnnouncement:  { backgroundColor: '#f59e0b10', borderColor: '#f59e0b30' },
  venueFeedBadgeText: { fontSize: 10, fontWeight: '700' },
  badgePromoText:     { color: '#29B6F6' },
  badgeAnnoText:      { color: '#f59e0b' },
  venueFeedTitle:  { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  venueFeedDesc:   { fontSize: 13, color: '#8EADC7', lineHeight: 18 },
  venueFeedCta:    { fontSize: 12, color: '#29B6F6', fontWeight: '600' },
  discountPill: {
    backgroundColor: '#22c55e18', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#22c55e30',
  },
  discountText: { fontSize: 12, fontWeight: '700', color: '#22c55e' },
  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: '#29B6F610', borderWidth: 1, borderColor: '#29B6F620',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
})
