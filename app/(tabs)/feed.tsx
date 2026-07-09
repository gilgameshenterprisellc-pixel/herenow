import { useState, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTabBarScroll } from '@/contexts/TabBarScrollContext'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { TAB_SAFE_BOTTOM } from './_layout'
import { supabase } from '@/lib/supabase'
import { fetchMyVenues, type VenueSubscription } from '@/lib/venueSubscriptions'
import { useNotifications } from '@/hooks/useNotifications'
import AnimatedBackground from '@/components/AnimatedBackground'
import { markOneRead, markAllRead, type Notification } from '@/lib/notifications'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

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

const NOTIF_META: Record<string, { icon: IoniconsName; color: string }> = {
  wemet_request:      { icon: 'people-outline',           color: '#29B6F6' },
  wemet_confirmed:    { icon: 'checkmark-circle-outline', color: '#22c55e' },
  event_rsvp:         { icon: 'calendar-outline',         color: '#a855f7' },
  badge_earned:       { icon: 'ribbon-outline',           color: '#f59e0b' },
  venue_announcement: { icon: 'megaphone-outline',        color: '#f97316' },
  system:             { icon: 'radio-outline',            color: '#7A93AC' },
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

export default function UpdatesScreen() {
  const [myVenues, setMyVenues]     = useState<VenueSubscription[]>([])
  const [venueFeed, setVenueFeed]   = useState<VenueFeedItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [venueLoaded, setVenueLoaded] = useState(false)

  const { onScroll } = useTabBarScroll()
  const { notifications, loading: notifLoading, refresh: refreshNotifs } = useNotifications()

  // Non-DM activity items shown in this tab
  const activityItems = notifications
    .filter((n) => n.type !== 'message')
    .slice(0, 8)

  const loadVenueFeed = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const subs = await fetchMyVenues()
    setMyVenues(subs)

    if (subs.length > 0) {
      const zoneIds = subs.map((s) => s.zone_id)
      // Zones where this user is a paid-in-attention subscriber (checked in)
      const subscribedZones = new Set(subs.filter((s) => s.is_subscriber).map((s) => s.zone_id))
      const now = new Date().toISOString()

      // A 'subscribers'-only post is visible only if you subscribe to that venue.
      const audienceOk = (row: { zone_id: string; audience?: string | null }) =>
        row.audience !== 'subscribers' || subscribedZones.has(row.zone_id)

      const [{ data: promosRaw }, { data: annosRaw }] = await Promise.all([
        supabase
          .from('venue_promotions')
          .select('id, zone_id, title, description, discount_label, audience, created_at, zones(name)')
          .in('zone_id', zoneIds)
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`ends_at.is.null,ends_at.gte.${now}`)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('venue_announcements')
          .select('id, zone_id, message, audience, created_at, zones(name)')
          .in('zone_id', zoneIds)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      const promos = (promosRaw ?? []).filter(audienceOk)
      const annos  = (annosRaw ?? []).filter(audienceOk)

      // Log promo views (fire-and-forget)
      if ((promos ?? []).length > 0) {
        const viewRows = (promos ?? []).map((p: any) => ({
          promotion_id: p.id,
          zone_id:      p.zone_id,
          user_id:      user.id,
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

    setVenueLoaded(true)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadVenueFeed(), refreshNotifs()])
    setRefreshing(false)
  }

  // Load venue feed on first render (notifications loaded by hook)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadVenueFeed() }, [])

  // Opening the Updates tab clears the unread badge (Jacob #12).
  useEffect(() => {
    markAllRead().catch(() => {})
  }, [])

  const handleNotifPress = (n: Notification) => {
    if (!n.is_read) markOneRead(n.id).catch(() => {})
    const d = n.data as Record<string, any> | null
    // Type strings as written by lib/weMet.ts are 'we_met_*'; keep the old
    // 'wemet_*' spellings too so legacy notification rows still route.
    if (['we_met_request', 'we_met_confirmed', 'wemet_request', 'wemet_confirmed'].includes(n.type)) {
      router.push('/we-met')
    } else if (['circle_request', 'circle_accepted'].includes(n.type)) {
      router.push('/circle' as any)
    } else if (n.type === 'message' && d?.we_met_id) {
      router.push(`/messages/${d.we_met_id}` as any)
    } else if (n.type === 'badge_earned') {
      router.push('/badges')
    } else if (d?.zone_id) {
      router.push(`/zone/${d.zone_id}`)
    }
  }

  const insets = useSafeAreaInsets()

  const webCenter = Platform.select({
    web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
    default: {},
  })

  const hasContent = myVenues.length > 0 || venueFeed.length > 0 || activityItems.length > 0

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <View style={styles.headerWrap}>
        <View style={styles.accentLine} />
        <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top + 8 : 20 }, webCenter]}>
          <Image source={require('@/assets/logo-wordmark.png')} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>Updates</Text>
          <Text style={styles.headerSub}>From your venues & activity</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, webCenter]}
        onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />
        }
      >
        {/* My Venues chip row */}
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

        {/* From Your Venues (promos + announcements) */}
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

        {/* Activity — We Met, badges, events (no DMs) */}
        {activityItems.length > 0 && (
          <View style={styles.activitySection}>
            <Text style={styles.sectionLabel}>ACTIVITY</Text>
            {activityItems.map((n) => {
              const meta = NOTIF_META[n.type] ?? NOTIF_META.system
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.activityRow, !n.is_read && styles.activityRowUnread]}
                  onPress={() => handleNotifPress(n)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.activityIcon, { backgroundColor: meta.color + '18', borderColor: meta.color + '25', borderWidth: 1 }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityTitle}>{n.title}</Text>
                    <Text style={styles.activityBody} numberOfLines={1}>{n.body}</Text>
                  </View>
                  <Text style={styles.activityTime}>{timeAgo(n.created_at)}</Text>
                  {!n.is_read && <View style={[styles.activityDot, { backgroundColor: meta.color }]} />}
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* Empty state */}
        {!refreshing && venueLoaded && !hasContent && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="radio-outline" size={32} color="#29B6F6" />
            </View>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>
              Follow a venue to see their promos and announcements. Check in to a venue to start getting activity.
            </Text>
          </View>
        )}
      </ScrollView>
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
  brandLogo: { width: 96, height: 17, marginBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  list:        { paddingHorizontal: 16, paddingBottom: TAB_SAFE_BOTTOM, paddingTop: 12, gap: 0 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#7A93AC',
    letterSpacing: 1.5, marginBottom: 8, marginTop: 4,
  },
  venuesSection: { gap: 8, marginBottom: 16 },
  venuesList:    { gap: 8, flexDirection: 'row', paddingBottom: 4 },
  venueChip: {
    backgroundColor: '#0D1B2E', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#29B6F630',
  },
  venueChipEmoji: { fontSize: 14 },
  venueChipName:  { fontSize: 13, fontWeight: '700', color: '#f8fafc', maxWidth: 100 },
  venueFeedSection: { gap: 8, marginBottom: 20 },
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
  activitySection: { gap: 2, marginBottom: 12 },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#050A15', borderRadius: 8,
  },
  activityRowUnread: { backgroundColor: '#29B6F606', borderBottomColor: '#0D1B2E' },
  activityIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityInfo: { flex: 1, gap: 2 },
  activityTitle: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  activityBody:  { fontSize: 11, color: '#7A93AC' },
  activityTime:  { fontSize: 11, color: '#4A6580', flexShrink: 0 },
  activityDot:   { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: '#29B6F610', borderWidth: 1, borderColor: '#29B6F620',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
})
