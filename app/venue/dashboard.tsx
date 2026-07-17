import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Animated, TextInput, Switch,
  Image,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { fetchSubscriberCount, fetchFollowerCount, fetchVenueSubscribers, type VenueSubscriber } from '@/lib/venueSubscriptions'
import { fetchVenueThreads } from '@/lib/venueMessages'
import AvatarImage from '@/components/AvatarImage'
import { publicName } from '@/lib/format'
import * as ImagePicker from 'expo-image-picker'
import { createVenuePulsePost, fetchPulse, nextVenueNightExpiry, type PulsePost } from '@/lib/pulse'
import { fetchPendingVenuePhotos, setVenuePhotoStatus, type PendingVenuePhoto } from '@/lib/venuePhotos'
import { platformConfirm } from '@/lib/confirm'
import { hideVenueContent, muteVenueUser } from '@/lib/venueModeration'
import { sendVenueChatMessage } from '@/lib/chat'
import { screenText, blockedMessage } from '@/lib/textModeration'
import { screenImage } from '@/lib/moderation'
import { useToast } from '@/contexts/ToastContext'
import { useVenueChat } from '@/hooks/useVenueChat'
import PulsePostCard from '@/components/PulsePostCard'
import ChatMessage from '@/components/ChatMessage'

interface VenueZone {
  id: string
  name: string
  type: string | null
  center_lat: number | null
  center_lng: number | null
  member_count: number | null
  avatar_url: string | null
  banner_url: string | null
  category: string | null
  wait_time_minutes: number | null
  chat_enabled: boolean | null
  pulse_enabled: boolean | null
}


const WAIT_PRESETS = [0, 5, 15, 30, 45, 60] // minutes; null = not shown

interface AggregateStats {
  total: number
  ageRanges: Record<string, number>
  interests: Record<string, number>
  socialModes: Record<string, number>
}

const SOCIAL_MODE_LABELS: Record<string, { label: string; color: string }> = {
  dating:     { label: 'Dating',     color: '#f43f5e' },
  friends:    { label: 'Friends',    color: '#22c55e' },
  networking: { label: 'Networking', color: '#3b82f6' },
  just_vibes: { label: 'Just Vibes', color: '#a855f7' },
}

interface DayCount { label: string; count: number }

interface PromoPerf { id: string; title: string; discount_label: string | null; views: number }
interface EventPerf  { id: string; title: string; starts_at: string; rsvps: number; checkins: number }

interface Analytics {
  totalCheckins: number
  eventCount: number
  annoCount: number
  weekChart: DayCount[]
  peakHours: string[]
  todayCount: number
  yesterdayCount: number
  newVisitors: number
  returningVisitors: number
  promoPerf: PromoPerf[]
  eventPerf: EventPerf[]
}

export default function VenueDashboard() {
  const insets = useSafeAreaInsets()
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [venue, setVenue]             = useState<VenueZone | null>(null)
  const [stats, setStats]             = useState<AggregateStats>({ total: 0, ageRanges: {}, interests: {}, socialModes: {} })
  const [ownerName, setOwnerName]         = useState('')
  const [venueStatus, setVenueStatus]     = useState<string | null>(null)
  const [denialReason, setDenialReason]   = useState<string | null>(null)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [subscribers, setSubscribers]         = useState<VenueSubscriber[]>([])
  const [followerCount, setFollowerCount]     = useState(0)
  const [wemetsToday, setWemetsToday] = useState(0)
  const [pendingPhotos, setPendingPhotos] = useState<PendingVenuePhoto[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [isClosed, setIsClosed]           = useState(false)
  const [closureMessage, setClosureMessage] = useState('')
  const [closureEditing, setClosureEditing] = useState(false)
  const [pulseText, setPulseText]         = useState('')
  const [pulsePin, setPulsePin]           = useState(false)
  const [pulsePosting, setPulsePosting]   = useState(false)
  const [pulsePosted, setPulsePosted]     = useState(false)
  const [pulseMediaUrl, setPulseMediaUrl] = useState<string | null>(null)
  const [pulsePhotoUploading, setPulsePhotoUploading] = useState(false)
  const [customWait, setCustomWait]       = useState('')
  const [dashTab, setDashTab]             = useState<'overview' | 'feed' | 'analytics'>('overview')
  const [monitorPulse, setMonitorPulse]   = useState<PulsePost[]>([])
  const [venueChatText, setVenueChatText] = useState('')
  const [sendingVenueChat, setSendingVenueChat] = useState(false)
  const [venueMsgUnread, setVenueMsgUnread] = useState(0)
  const { showToast } = useToast()

  // Venue owner monitors their own Pulse + Chat (needs owner-read RLS).
  const { messages: monitorChat, refresh: refreshChat } = useVenueChat(venue?.id ?? '')

  useEffect(() => {
    if (!venue?.id) return
    fetchPulse(venue.id).then(setMonitorPulse).catch(() => {})
  }, [venue?.id, dashTab])

  // Unread patron messages, so the venue sees its inbox from the dashboard.
  useEffect(() => {
    if (!venue?.id) return
    fetchVenueThreads()
      .then((ts) => setVenueMsgUnread(ts.filter((t) => t.viewer_is_owner).reduce((n, t) => n + (t.unread_count ?? 0), 0)))
      .catch(() => {})
  }, [venue?.id, dashTab])

  // Anonymous Guest N labels, same as the zone chat (no real names to the venue).
  const monitorGuests = useMemo(() => {
    const map = new Map<string, number>()
    let n = 0
    for (const m of monitorChat) {
      if (!map.has(m.user_id)) map.set(m.user_id, ++n)
    }
    return map
  }, [monitorChat])
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [])

  const load = useCallback(async () => {
    try {
      const user = await getAuthedUser()
      if (!user) { router.replace('/(auth)/login'); return }

      const [{ data: profile }, { data: zones }] = await Promise.all([
        supabase.from('profiles').select('display_name, venue_status, denial_reason').eq('id', user.id).maybeSingle(),
        supabase.from('zones').select('*').eq('owner_id', user.id).limit(1),
      ])

      setVenueStatus(profile?.venue_status ?? null)
      setDenialReason(profile?.denial_reason ?? null)
      setOwnerName(profile?.display_name ?? '')
      const z = zones?.[0] ?? null
      setVenue(z)
      if (z) {
        setIsClosed(!!(z as any).is_temporarily_closed)
        setClosureMessage((z as any).temporary_closure_message ?? '')
      }

      if (z) {
        // "Checked in right now" = an active session seen in the last 30 min.
        // Without the last_seen_at gate, people who left without checking out
        // (app closed) linger forever and the dashboard shows ghosts.
        const presenceCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const { data: sessions } = await supabase
          .from('sessions')
          .select('social_mode, profiles(age_range, interest_tags)')
          .eq('zone_id', z.id)
          .eq('is_active', true)
          .gt('last_seen_at', presenceCutoff)

        const ageRanges: Record<string, number> = {}
        const interests: Record<string, number> = {}
        const socialModes: Record<string, number> = {}
        let total = 0

        for (const s of (sessions ?? []) as any[]) {
          total++
          if (s.social_mode) socialModes[s.social_mode] = (socialModes[s.social_mode] ?? 0) + 1
          const p = s.profiles
          if (!p) continue
          if (p.age_range) ageRanges[p.age_range] = (ageRanges[p.age_range] ?? 0) + 1
          for (const tag of (p.interest_tags ?? [])) {
            interests[tag] = (interests[tag] ?? 0) + 1
          }
        }

        setStats({ total, ageRanges, interests, socialModes })
        const [subCount, folCount, subList] = await Promise.all([
          fetchSubscriberCount(z.id),
          fetchFollowerCount(z.id),
          fetchVenueSubscribers(z.id),
        ])
        setSubscriberCount(subCount)
        setFollowerCount(folCount)
        setSubscribers(subList)

        // We Mets confirmed here in the last 24h (aggregate count, no individual data)
        const { data: wemetsToday } = await supabase.rpc('venue_wemets_today', { zone_uuid: z.id })
        setWemetsToday(typeof wemetsToday === 'number' ? wemetsToday : 0)

        // Pending photo submissions awaiting the owner's review
        setPendingPhotos(await fetchPendingVenuePhotos(z.id))

        // Analytics queries — run in parallel
        const weekAgo    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const ninetyAgo  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const yestStart  = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1)

        const [totalRes, weekRes, eventsRes, annoRes, todayRes, yestRes, allTimeRes, promosRes, promoViewsRes, eventPerfRes, pastSessionsRes] = await Promise.all([
          supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('zone_id', z.id),
          supabase.from('sessions').select('checked_in_at').eq('zone_id', z.id).gte('checked_in_at', weekAgo),
          supabase.from('venue_events').select('id', { count: 'exact', head: true }).eq('zone_id', z.id),
          supabase.from('venue_announcements').select('id', { count: 'exact', head: true }).eq('zone_id', z.id),
          supabase.from('sessions').select('user_id').eq('zone_id', z.id).gte('checked_in_at', todayStart.toISOString()),
          supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('zone_id', z.id)
            .gte('checked_in_at', yestStart.toISOString()).lt('checked_in_at', todayStart.toISOString()),
          supabase.from('sessions').select('user_id, checked_in_at').eq('zone_id', z.id).lt('checked_in_at', todayStart.toISOString()),
          supabase.from('venue_promotions').select('id, title, discount_label').eq('zone_id', z.id).order('created_at', { ascending: false }),
          supabase.from('promo_views').select('promotion_id').eq('zone_id', z.id),
          supabase.from('venue_events').select('id, title, starts_at, ends_at, rsvp_count').eq('zone_id', z.id).order('starts_at', { ascending: false }).limit(5),
          supabase.from('sessions').select('checked_in_at').eq('zone_id', z.id).gte('checked_in_at', ninetyAgo),
        ])

        // Build 7-day chart (Sun–Sat labels)
        const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const dayCounts: Record<number, number> = {}
        const hourCounts: Record<number, number> = {}
        for (const row of (weekRes.data ?? []) as any[]) {
          const d = new Date(row.checked_in_at)
          dayCounts[d.getDay()] = (dayCounts[d.getDay()] ?? 0) + 1
          hourCounts[d.getHours()] = (hourCounts[d.getHours()] ?? 0) + 1
        }
        const weekChart: DayCount[] = DAY_LABELS.map((label, i) => ({
          label,
          count: dayCounts[i] ?? 0,
        }))

        // Peak hours — top 3
        const peakHours = Object.entries(hourCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([h]) => {
            const hr = parseInt(h, 10)
            const suffix = hr >= 12 ? 'pm' : 'am'
            const display = hr % 12 === 0 ? 12 : hr % 12
            return `${display}${suffix}`
          })

        // Customer mix
        const todayUserIds = new Set((todayRes.data ?? []).map((r: any) => r.user_id))
        const prevUserIds  = new Set((allTimeRes.data ?? []).map((r: any) => r.user_id))
        let newVisitors = 0, returningVisitors = 0
        todayUserIds.forEach((uid) => { prevUserIds.has(uid) ? returningVisitors++ : newVisitors++ })

        // Promo performance — view count per promo
        const viewCountMap: Record<string, number> = {}
        for (const v of (promoViewsRes.data ?? []) as any[]) {
          viewCountMap[v.promotion_id] = (viewCountMap[v.promotion_id] ?? 0) + 1
        }
        const promoPerf: PromoPerf[] = (promosRes.data ?? []).map((p: any) => ({
          id: p.id, title: p.title, discount_label: p.discount_label,
          views: viewCountMap[p.id] ?? 0,
        })).sort((a: PromoPerf, b: PromoPerf) => b.views - a.views)

        // Event performance — RSVPs + check-ins during event window (from 90-day session cache)
        const pastSessions = (pastSessionsRes.data ?? []) as { checked_in_at: string }[]
        const eventPerf: EventPerf[] = (eventPerfRes.data ?? []).map((e: any) => {
          const start = new Date(e.starts_at).getTime()
          const end   = e.ends_at
            ? new Date(e.ends_at).getTime()
            : start + 4 * 60 * 60 * 1000
          const checkins = pastSessions.filter(s => {
            const t = new Date(s.checked_in_at).getTime()
            return t >= start && t <= end
          }).length
          return { id: e.id, title: e.title, starts_at: e.starts_at, rsvps: e.rsvp_count ?? 0, checkins }
        })

        setAnalytics({
          totalCheckins: totalRes.count ?? 0,
          eventCount: eventsRes.count ?? 0,
          annoCount: annoRes.count ?? 0,
          weekChart,
          peakHours,
          todayCount:       todayUserIds.size,
          yesterdayCount:   yestRes.count ?? 0,
          newVisitors,
          returningVisitors,
          promoPerf,
          eventPerf,
        })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleSignOut = () => {
    platformConfirm(
      'Sign out',
      'Are you sure?',
      async () => {
        try {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        } catch {
          // sign-out errors are rare; navigate anyway
          router.replace('/(auth)/login')
        }
      },
      { confirmText: 'Sign out', destructive: true }
    )
  }

  const toggleClosed = async (val: boolean) => {
    setIsClosed(val)
    if (!venue) return
    await supabase.from('zones').update({ is_temporarily_closed: val }).eq('id', venue.id)
  }

  const saveClosureMessage = async () => {
    if (!venue) return
    await supabase.from('zones').update({ temporary_closure_message: closureMessage.trim() || null }).eq('id', venue.id)
    setClosureEditing(false)
  }

  const setWaitTime = async (minutes: number | null) => {
    if (!venue) return
    setVenue({ ...venue, wait_time_minutes: minutes })
    await supabase.from('zones').update({
      wait_time_minutes:    minutes,
      wait_time_updated_at: minutes === null ? null : new Date().toISOString(),
    }).eq('id', venue.id)
  }

  const toggleFeature = async (field: 'chat_enabled' | 'pulse_enabled', value: boolean) => {
    if (!venue) return
    setVenue({ ...venue, [field]: value })
    await supabase.from('zones').update({ [field]: value }).eq('id', venue.id)
  }


  const attachPulsePhoto = async () => {
    if (!venue || pulsePhotoUploading) return
    setPulsePhotoUploading(true)
    try {
      // Use the venue-media bucket (same as Gallery) with the zone id as the
      // first path segment — the avatars bucket's RLS rejected pulse/<venueId>/…
      // so venue pulse photos silently failed to upload (Jacob).
      const path = `${venue.id}/pulse-${Date.now()}.jpg`
      let uploadBody: Blob | ArrayBuffer | null = null
      let contentType = 'image/jpeg'
      if (Platform.OS === 'web') {
        const file = await new Promise<File | null>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'; input.accept = 'image/*'
          input.onchange = () => resolve(input.files?.[0] ?? null)
          input.click()
        })
        if (!file) { setPulsePhotoUploading(false); return }
        uploadBody = file; contentType = file.type || 'image/jpeg'
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') { setPulsePhotoUploading(false); return }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
        if (result.canceled || !result.assets[0]) { setPulsePhotoUploading(false); return }
        const asset = result.assets[0]
        uploadBody = await (await fetch(asset.uri)).arrayBuffer()
        contentType = asset.mimeType || 'image/jpeg'
      }
      const { error } = await supabase.storage.from('venue-media').upload(path, uploadBody as any, { contentType, upsert: true })
      if (error) { console.error('[pulse photo] upload:', error.message); setPulsePhotoUploading(false); return }
      const { data } = supabase.storage.from('venue-media').getPublicUrl(path)
      const url = `${data.publicUrl}?v=${Date.now()}`
      const shot = await screenImage(url)
      if (!shot.ok) {
        showToast('That photo was blocked — it looked explicit.', 'error')
        setPulsePhotoUploading(false)
        return
      }
      setPulseMediaUrl(url)
    } catch (e) {
      console.error('[pulse photo] error:', e)
    } finally {
      setPulsePhotoUploading(false)
    }
  }

  const postToPulse = async () => {
    if (!venue || (!pulseText.trim() && !pulseMediaUrl) || pulsePosting) return
    const screen = screenText(pulseText)
    if (!screen.ok) { showToast(blockedMessage(screen.category), 'error'); return }
    setPulsePosting(true)
    const ok = await createVenuePulsePost({ zoneId: venue.id, content: pulseText, mediaUrl: pulseMediaUrl, pinned: pulsePin })
    setPulsePosting(false)
    if (ok) {
      setPulseText('')
      setPulsePin(false)
      setPulseMediaUrl(null)
      setPulsePosted(true)
      setTimeout(() => setPulsePosted(false), 2500)
    }
  }

  const reviewPhoto = async (id: string, status: 'approved' | 'rejected') => {
    setPendingPhotos((prev) => prev.filter((p) => p.id !== id))
    await setVenuePhotoStatus(id, status)
  }

  // First name only for the chat monitor (Joshua: first name, no last initial).
  const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || ''

  // Venue moderation: hide a guest's Pulse post or Chat message.
  const moderatePulse = async (id: string) => {
    setMonitorPulse((prev) => prev.filter((p) => p.id !== id))
    await hideVenueContent('pulse', id)
  }
  const sendVenueChat = async () => {
    const text = venueChatText.trim()
    if (!text || !venue || sendingVenueChat) return
    const screen = screenText(text)
    if (!screen.ok) { showToast(blockedMessage(screen.category), 'error'); return }
    setSendingVenueChat(true)
    const msg = await sendVenueChatMessage({ zoneId: venue.id, content: text })
    setSendingVenueChat(false)
    if (msg) { setVenueChatText(''); refreshChat() }
    else showToast('Could not send. Try again.', 'error')
  }

  const moderateChat = async (id: string) => {
    const ok = await hideVenueContent('chat', id)
    if (ok) refreshChat()
  }

  // Timeout a guest: they can't post chat or Pulse for the rest of the night.
  const muteGuest = (userId: string) => {
    if (!venue) return
    platformConfirm(
      'Mute this guest?',
      "They won't be able to post in your Chat or Pulse for the rest of tonight.",
      async () => {
        const ok = await muteVenueUser(venue.id, userId, nextVenueNightExpiry())
        showToast(ok ? 'Guest muted for tonight.' : 'Could not mute. Try again.', ok ? 'success' : 'error')
      },
      { confirmText: 'Mute', destructive: true },
    )
  }

  const topInterests = Object.entries(stats.interests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const isLive = (venue?.member_count ?? stats.total) > 0

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" size="large" />
      </View>
    )
  }

  if (venueStatus === 'denied') {
    return (
      <View style={[styles.center, { paddingHorizontal: 24 }]}>
        <Reanimated.View entering={FadeInDown.delay(60).duration(500)} style={[styles.pendingCard, styles.deniedCard]}>
          <View style={[styles.pendingIconWrap, styles.deniedIconWrap]}>
            <Ionicons name="close-circle-outline" size={52} color="#ef4444" />
          </View>
          <Text style={[styles.pendingTitle, styles.deniedTitle]}>Application Not Approved</Text>
          <Text style={styles.pendingSub}>
            We reviewed your application and weren't able to approve it at this time.
          </Text>
          {denialReason ? (
            <View style={styles.deniedReasonBox}>
              <Text style={styles.deniedReasonLabel}>Reason given:</Text>
              <Text style={styles.deniedReasonText}>{denialReason}</Text>
            </View>
          ) : null}
          <View style={styles.pendingDivider} />
          <Text style={styles.pendingHint}>
            Questions or want to update your info and reapply?{'\n'}Email{' '}
            <Text style={styles.pendingEmail}>support@herenow.app</Text>
          </Text>
        </Reanimated.View>
        <Reanimated.View entering={FadeInDown.delay(220).duration(500)} style={{ width: '100%' }}>
          <TouchableOpacity
            style={styles.backHomeBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.backHomeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </Reanimated.View>
      </View>
    )
  }

  if (venueStatus !== 'approved') {
    return (
      <View style={[styles.center, { paddingHorizontal: 24 }]}>
        <View style={styles.pendingGlow} />
        <Reanimated.View entering={FadeInDown.delay(60).duration(500)} style={styles.pendingCard}>
          <View style={styles.pendingIconWrap}>
            <Ionicons name="time-outline" size={52} color="#f59e0b" />
          </View>
          <Text style={styles.pendingTitle}>Application Under Review</Text>
          <Text style={styles.pendingSub}>
            Your venue is in our review queue. We'll notify you as soon as it's approved — usually within 24–48 hours.
          </Text>
          <View style={styles.pendingDivider} />
          <Text style={styles.pendingHint}>
            Questions? Email{' '}
            <Text style={styles.pendingEmail}>support@herenow.app</Text>
          </Text>
        </Reanimated.View>
        <Reanimated.View entering={FadeInDown.delay(220).duration(500)} style={{ width: '100%' }}>
          <TouchableOpacity
            style={styles.backHomeBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.backHomeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </Reanimated.View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Ambient glow */}
      <View style={[styles.glow, styles.glowTop]} />

      {/* Venue banner photo */}
      {venue?.banner_url ? (
        <Image
          source={{ uri: venue.banner_url }}
          style={[styles.venueBanner, { marginTop: insets.top }]}
          resizeMode="cover"
        />
      ) : null}

      {/* Header */}
      <View style={[styles.header, { paddingTop: venue?.banner_url ? 12 : insets.top + 14 }]}>
        <View style={styles.headerLeft}>
          {venue?.avatar_url ? (
            <Image source={{ uri: venue.avatar_url }} style={styles.venueAvatar} resizeMode="cover" />
          ) : null}
          <View style={{ gap: 2 }}>
            <Text style={styles.headerGreeting}>Hey, {ownerName || 'there'} 👋</Text>
            <Text style={styles.headerVenue}>{venue?.name ?? 'Your Venue'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/venue/edit' as any)}>
            <Text style={styles.editBtnText}>Edit Venue</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>↩</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
      >
        {/* Dashboard tabs — Overview / Feed / Analytics (Jacob: stop the pile-up) */}
        {venue && (
          <View style={styles.dashTabs}>
            {(['overview', 'feed', 'analytics'] as const).map((t) => (
              <TouchableOpacity key={t} style={[styles.dashTab, dashTab === t && styles.dashTabOn]} onPress={() => setDashTab(t)} activeOpacity={0.8}>
                <Text style={[styles.dashTabText, dashTab === t && styles.dashTabTextOn]}>
                  {t === 'overview' ? 'Overview' : t === 'feed' ? 'Feed' : 'Analytics'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {dashTab === 'overview' && (<>
        {/* Live counter */}
        <View style={[styles.liveCard, isLive && styles.liveCardActive]}>
          <View style={styles.liveLeft}>
            {isLive && (
              <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <View style={[styles.liveDotCore, isLive ? styles.liveDotCoreActive : styles.liveDotCoreIdle]} />
            <Text style={[styles.liveLabel, isLive && styles.liveLabelActive]}>
              {isLive ? 'LIVE NOW' : 'QUIET'}
            </Text>
          </View>
          <Text style={[styles.liveCount, isLive && styles.liveCountActive]}>
            {stats.total}
          </Text>
          <Text style={styles.liveSub}>
            {stats.total === 1 ? 'person checked in' : 'people checked in'}
          </Text>
        </View>

        {/* Nightly recap / afterglow */}
        {venue && (
          <TouchableOpacity style={styles.recapLink} onPress={() => router.push('/venue/recap' as any)}>
            <Text style={styles.recapLinkEmoji}>🌙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.recapLinkTitle}>Nightly Recap</Text>
              <Text style={styles.recapLinkSub}>Last night's numbers + where your crowd came from and went</Text>
            </View>
            <Text style={styles.recapLinkArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Temporarily closed toggle */}
        {venue && (
          <View style={[styles.closedCard, isClosed && styles.closedCardActive]}>
            <View style={styles.closedRow}>
              <View style={styles.closedLeft}>
                <Text style={[styles.closedLabel, isClosed && styles.closedLabelActive]}>
                  {isClosed ? '🔴 Temporarily Closed' : '🟢 Open for check-ins'}
                </Text>
                <Text style={styles.closedSub}>
                  {isClosed
                    ? 'Check-ins are blocked. Guests will see your message.'
                    : 'Guests can check in normally.'}
                </Text>
              </View>
              <Switch
                value={isClosed}
                onValueChange={toggleClosed}
                trackColor={{ false: '#1A2E4A', true: '#ef444450' }}
                thumbColor={isClosed ? '#ef4444' : '#f8fafc'}
              />
            </View>
            {isClosed && (
              <View style={styles.closedMsgWrap}>
                {closureEditing ? (
                  <>
                    <TextInput
                      style={styles.closedInput}
                      value={closureMessage}
                      onChangeText={setClosureMessage}
                      placeholder="e.g. Private event tonight — back tomorrow at 5pm"
                      placeholderTextColor="#4A6580"
                      maxLength={120}
                    />
                    <View style={styles.closedActions}>
                      <TouchableOpacity onPress={() => setClosureEditing(false)}>
                        <Text style={styles.closedCancel}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.closedSaveBtn} onPress={saveClosureMessage}>
                        <Text style={styles.closedSaveText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => setClosureEditing(true)} style={styles.closedMsgRow}>
                    <Text style={styles.closedMsgText} numberOfLines={2}>
                      {closureMessage.trim() || 'Tap to add a message for guests…'}
                    </Text>
                    <Text style={styles.closedEditHint}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        </>)}

        {dashTab === 'feed' && (<>
        {/* Post to Pulse — venue's own message on the live feed */}
        {venue && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Post to Pulse</Text>
            <Text style={styles.cardHint}>Drop a message on your live feed. Everyone checked in sees it.</Text>
            <TextInput
              style={styles.pulseInput}
              value={pulseText}
              onChangeText={setPulseText}
              placeholder="Welcome to launch night! Tag your moments 📸"
              placeholderTextColor="#4A6580"
              multiline
              maxLength={280}
            />
            {pulseMediaUrl ? (
              <View style={styles.pulsePhotoPreviewWrap}>
                <Image source={{ uri: pulseMediaUrl }} style={styles.pulsePhotoPreview} resizeMode="cover" />
                <TouchableOpacity style={styles.pulsePhotoRemove} onPress={() => setPulseMediaUrl(null)}>
                  <Text style={styles.pulsePhotoRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.pulsePhotoBtn} onPress={attachPulsePhoto} disabled={pulsePhotoUploading}>
                {pulsePhotoUploading
                  ? <ActivityIndicator color="#29B6F6" size="small" />
                  : <Text style={styles.pulsePhotoBtnText}>📷 Add a photo</Text>}
              </TouchableOpacity>
            )}
            <View style={styles.pulseRow}>
              <TouchableOpacity style={styles.pinToggle} onPress={() => setPulsePin(!pulsePin)}>
                <View style={[styles.pinBox, pulsePin && styles.pinBoxOn]}>
                  {pulsePin && <Text style={styles.pinCheck}>✓</Text>}
                </View>
                <Text style={styles.pinLabel}>Pin to top</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pulsePostBtn, ((!pulseText.trim() && !pulseMediaUrl) || pulsePosting) && { opacity: 0.5 }]}
                onPress={postToPulse}
                disabled={(!pulseText.trim() && !pulseMediaUrl) || pulsePosting}
              >
                {pulsePosting
                  ? <ActivityIndicator color="#050A15" size="small" />
                  : <Text style={styles.pulsePostText}>{pulsePosted ? 'Posted ✓' : 'Post'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Live Pulse — read-only monitor of the feed */}
        {venue && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Live Pulse</Text>
            <Text style={styles.cardHint}>What guests are posting right now. Read-only.</Text>
            {monitorPulse.length === 0 ? (
              <Text style={styles.monitorEmpty}>No Pulse posts yet tonight.</Text>
            ) : (
              <ScrollView
                style={styles.feedPane}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                contentContainerStyle={{ gap: 10, paddingTop: 8 }}
              >
                {monitorPulse.map((p) => (
                  <View key={p.id} style={styles.modRow}>
                    <View style={{ flex: 1 }}>
                      <PulsePostCard post={p} currentUserId="" canPin={false} />
                    </View>
                    <TouchableOpacity
                      onPress={() => moderatePulse(p.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.modDelete}
                    >
                      <Text style={styles.modDeleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Live Chat — read-only monitor for moderation */}
        {venue && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Live Chat</Text>
            <Text style={styles.cardHint}>Monitor the room. ✕ removes a message; 🔇 mutes a guest for the night.</Text>
            {monitorChat.length === 0 ? (
              <Text style={styles.monitorEmpty}>No chat activity yet tonight.</Text>
            ) : (
              <ScrollView
                style={styles.feedPane}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                contentContainerStyle={{ gap: 4, paddingTop: 8 }}
              >
                {monitorChat.map((m) => (
                  <View key={m.id} style={styles.modRow}>
                    <View style={{ flex: 1 }}>
                      <ChatMessage
                        message={m}
                        currentUserId=""
                        senderLabel={firstName(m.profiles?.display_name) || `Guest ${monitorGuests.get(m.user_id) ?? '?'}`}
                      />
                    </View>
                    {!m.is_venue_msg && (
                      <TouchableOpacity
                        onPress={() => muteGuest(m.user_id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.modMute}
                      >
                        <Text style={styles.modMuteText}>🔇</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => moderateChat(m.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.modDelete}
                    >
                      <Text style={styles.modDeleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.venueChatRow}>
              <TextInput
                style={styles.venueChatInput}
                value={venueChatText}
                onChangeText={setVenueChatText}
                placeholder="Message the room as the venue…"
                placeholderTextColor="#4A6580"
                maxLength={280}
                onSubmitEditing={sendVenueChat}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.venueChatSend, (!venueChatText.trim() || sendingVenueChat) && { opacity: 0.5 }]}
                onPress={sendVenueChat}
                disabled={!venueChatText.trim() || sendingVenueChat}
              >
                {sendingVenueChat
                  ? <ActivityIndicator color="#050A15" size="small" />
                  : <Text style={styles.venueChatSendText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Photo submissions awaiting review */}
        {venue && pendingPhotos.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Photo Submissions ({pendingPhotos.length})</Text>
            <Text style={styles.cardHint}>Guests submitted these to your gallery. Approve to show them publicly.</Text>
            {pendingPhotos.map((p) => (
              <View key={p.id} style={styles.photoReviewRow}>
                <Image source={{ uri: p.public_url }} style={styles.photoReviewImg} resizeMode="cover" />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.photoReviewBy}>from {p.submitter?.display_name ?? 'a guest'}</Text>
                  {p.submitted_note ? <Text style={styles.photoReviewNote} numberOfLines={2}>"{p.submitted_note}"</Text> : null}
                  <View style={styles.photoReviewActions}>
                    <TouchableOpacity style={styles.photoRejectBtn} onPress={() => reviewPhoto(p.id, 'rejected')}>
                      <Text style={styles.photoRejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoApproveBtn} onPress={() => reviewPhoto(p.id, 'approved')}>
                      <Text style={styles.photoApproveText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        </>)}

        {dashTab === 'overview' && (<>
        {/* Live wait time — guests see this on the venue card + page */}
        {venue && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Wait Time</Text>
            <Text style={styles.cardHint}>Set the current wait so guests know before they come.</Text>
            <View style={styles.chipWrap}>
              {WAIT_PRESETS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.waitChip, venue.wait_time_minutes === m && styles.waitChipOn]}
                  onPress={() => setWaitTime(m)}
                >
                  <Text style={[styles.waitChipText, venue.wait_time_minutes === m && styles.waitChipTextOn]}>
                    {m === 0 ? 'No wait' : `${m}m`}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.waitChip, venue.wait_time_minutes == null && styles.waitChipOff]}
                onPress={() => setWaitTime(null)}
              >
                <Text style={[styles.waitChipText, venue.wait_time_minutes == null && styles.waitChipTextOff]}>
                  Hide
                </Text>
              </TouchableOpacity>
            </View>
            {/* Custom wait time */}
            <View style={styles.customWaitRow}>
              <TextInput
                style={styles.customWaitInput}
                value={customWait}
                onChangeText={(t) => setCustomWait(t.replace(/[^0-9]/g, '').slice(0, 3))}
                placeholder="Custom"
                placeholderTextColor="#4A6580"
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.customWaitUnit}>min</Text>
              <TouchableOpacity
                style={[styles.customWaitBtn, !customWait && { opacity: 0.4 }]}
                disabled={!customWait}
                onPress={() => { setWaitTime(parseInt(customWait, 10)); setCustomWait('') }}
              >
                <Text style={styles.customWaitBtnText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Category is set in Edit Venue Profile (Jacob feedback 6) */}

        {/* Social features — turn Pulse / Chat off for an intimate night */}
        {venue && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Social Features</Text>
            <Text style={styles.cardHint}>Turn these off to stay on the map without the live feed, or to calm a busy night.</Text>
            <View style={styles.featureRow}>
              <Text style={styles.featureLabel}>Pulse</Text>
              <Switch
                value={venue.pulse_enabled !== false}
                onValueChange={(v) => toggleFeature('pulse_enabled', v)}
                trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
                thumbColor="#f8fafc"
              />
            </View>
            <View style={styles.featureRow}>
              <Text style={styles.featureLabel}>Chat</Text>
              <Switch
                value={venue.chat_enabled !== false}
                onValueChange={(v) => toggleFeature('chat_enabled', v)}
                trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
                thumbColor="#f8fafc"
              />
            </View>
          </View>
        )}

        {/* Tonight's Scene — in-app view of every venue and how their night looks */}
        <TouchableOpacity
          style={styles.mapCard}
          onPress={() => router.push('/venue/network' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.mapCardLeft}>
            <Ionicons name="map" size={22} color="#29B6F6" />
            <View style={{ gap: 2 }}>
              <Text style={styles.mapCardTitle}>Tonight's Scene</Text>
              <Text style={styles.mapCardSub}>See every venue and how busy their night is</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#4A6580" />
        </TouchableOpacity>

        {/* No venue set up yet */}
        {!venue && (
          <View style={styles.setupCard}>
            <Text style={styles.setupEmoji}>📍</Text>
            <Text style={styles.setupTitle}>Set your venue location</Text>
            <Text style={styles.setupSub}>
              Add your address so guests can find and check into your venue.
            </Text>
            <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/venue/edit' as any)}>
              <Text style={styles.setupBtnText}>Set Up Venue →</Text>
            </TouchableOpacity>
          </View>
        )}

        </>)}

        {dashTab === 'analytics' && (<>
        {/* Age breakdown */}
        {stats.total > 0 && Object.keys(stats.ageRanges).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Age Ranges in the Room</Text>
            <View style={styles.barList}>
              {Object.entries(stats.ageRanges).sort((a, b) => b[1] - a[1]).map(([range, count]) => {
                const pct = Math.round((count / stats.total) * 100)
                return (
                  <View key={range} style={styles.barRow}>
                    <Text style={styles.barLabel}>{range}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%` as any }]} />
                    </View>
                    <Text style={styles.barPct}>{pct}%</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Social mode breakdown — anonymized aggregate (Jacob Round 2, Q22) */}
        {stats.total > 0 && Object.keys(stats.socialModes).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Social Modes Tonight</Text>
            <View style={styles.barList}>
              {Object.entries(stats.socialModes).sort((a, b) => b[1] - a[1]).map(([mode, count]) => {
                const pct = Math.round((count / stats.total) * 100)
                const cfg = SOCIAL_MODE_LABELS[mode] ?? { label: mode, color: '#29B6F6' }
                return (
                  <View key={mode} style={styles.barRow}>
                    <Text style={styles.barLabel}>{cfg.label}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: cfg.color }]} />
                    </View>
                    <Text style={styles.barPct}>{pct}%</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Interest cloud */}
        {stats.total > 0 && topInterests.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Interests in the Room</Text>
            <View style={styles.interestCloud}>
              {topInterests.map(([tag, count]) => (
                <View key={tag} style={styles.interestPill}>
                  <Text style={styles.interestTag}>{tag}</Text>
                  <View style={styles.interestBadge}>
                    <Text style={styles.interestCount}>{count}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state when no check-ins */}
        {stats.total === 0 && venue && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏙️</Text>
            <Text style={styles.emptyTitle}>No one checked in yet</Text>
            <Text style={styles.emptySub}>
              Share your venue link or QR code so guests can check in when they arrive.
            </Text>
          </View>
        )}

        {/* Followers / Subscribers / connections stats */}
        {venue && (
          <View style={styles.statPairRow}>
            <View style={[styles.subStatCard, styles.statPairItem]}>
              <Text style={styles.subStatNum}>{followerCount}</Text>
              <Text style={styles.subStatLabel}>
                {followerCount === 1 ? 'follower' : 'followers'}
              </Text>
              <Text style={styles.subStatHint}>Following from anywhere</Text>
            </View>
            <View style={[styles.subStatCard, styles.statPairItem, styles.subStatCardGold]}>
              <Text style={[styles.subStatNum, { color: '#f59e0b' }]}>{subscriberCount}</Text>
              <Text style={styles.subStatLabel}>
                {subscriberCount === 1 ? 'subscriber' : 'subscribers'}
              </Text>
              <Text style={styles.subStatHint}>Patrons who checked in</Text>
            </View>
            <View style={[styles.subStatCard, styles.statPairItem]}>
              <Text style={styles.subStatNum}>{wemetsToday}</Text>
              <Text style={styles.subStatLabel}>connections</Text>
              <Text style={styles.subStatHint}>We Mets here today</Text>
            </View>
          </View>
        )}

        {/* Who your subscribers are — build real relationships */}
        {venue && subscribers.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Subscribers ({subscribers.length})</Text>
            <Text style={styles.cardHint}>Patrons who subscribed while checked in. Say hi, build the relationship.</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {subscribers.map((s) => (
                <View key={s.user_id} style={styles.subscriberRow}>
                  <AvatarImage uri={s.avatar_url} name={s.display_name} size={38} />
                  <Text style={styles.subscriberName} numberOfLines={1}>{publicName(s.display_name)}</Text>
                  <Text style={styles.subscriberDate}>
                    {new Date(s.subscribed_at).toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Analytics */}
        {analytics && (
          <>
            {/* Today's Activity */}
            {(() => {
              const diff = analytics.todayCount - analytics.yesterdayCount
              const pct  = analytics.yesterdayCount > 0
                ? Math.round(Math.abs(diff / analytics.yesterdayCount) * 100)
                : null
              return (
                <View style={styles.todayCard}>
                  <View style={styles.todayLeft}>
                    <Text style={styles.todayLabel}>TODAY'S CHECK-INS</Text>
                    <Text style={styles.todayCount}>{analytics.todayCount}</Text>
                  </View>
                  {analytics.yesterdayCount > 0 && pct !== null && (
                    <View style={[styles.todayBadge, diff >= 0 ? styles.todayBadgeUp : styles.todayBadgeDown]}>
                      <Text style={[styles.todayBadgeText, diff >= 0 ? styles.todayBadgeTextUp : styles.todayBadgeTextDown]}>
                        {diff >= 0 ? '↑' : '↓'} {pct}% vs yesterday
                      </Text>
                    </View>
                  )}
                  {analytics.yesterdayCount === 0 && (
                    <Text style={styles.todayYest}>— yesterday</Text>
                  )}
                </View>
              )
            })()}

            {/* Customer Mix */}
            {analytics.todayCount > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Customer Mix — Today</Text>
                <View style={styles.mixRow}>
                  <View style={styles.mixItem}>
                    <Text style={styles.mixNum}>{analytics.newVisitors}</Text>
                    <Text style={styles.mixLabel}>New Visitors</Text>
                    <Text style={styles.mixSub}>First time here</Text>
                  </View>
                  <View style={styles.mixDivider} />
                  <View style={styles.mixItem}>
                    <Text style={[styles.mixNum, styles.mixNumReturn]}>{analytics.returningVisitors}</Text>
                    <Text style={styles.mixLabel}>Returning</Text>
                    <Text style={styles.mixSub}>Been here before</Text>
                  </View>
                </View>
                {analytics.todayCount > 0 && (
                  <View style={styles.mixBar}>
                    <View style={[
                      styles.mixBarNew,
                      { flex: analytics.newVisitors || 1 },
                    ]} />
                    <View style={[
                      styles.mixBarReturn,
                      { flex: analytics.returningVisitors || 0.001 },
                    ]} />
                  </View>
                )}
              </View>
            )}

            {/* Metrics row */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricNum}>{analytics.totalCheckins}</Text>
                <Text style={styles.metricLabel}>Total{'\n'}Check-ins</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricNum}>{analytics.eventCount}</Text>
                <Text style={styles.metricLabel}>Events{'\n'}Hosted</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricNum}>{analytics.annoCount}</Text>
                <Text style={styles.metricLabel}>Announce-{'\n'}ments Sent</Text>
              </View>
            </View>

            {/* 7-day chart — always rendered so it never "disappears" on quiet weeks */}
            {(() => {
              const maxCount = Math.max(...analytics.weekChart.map((d) => d.count), 1)
              const hasAny = analytics.weekChart.some((d) => d.count > 0)
              return (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Check-ins — Last 7 Days</Text>
                  <View style={styles.chartRow}>
                    {analytics.weekChart.map((day) => {
                      const pct = day.count / maxCount
                      return (
                        <View key={day.label} style={styles.chartCol}>
                          <Text style={styles.chartBarCount}>{day.count > 0 ? day.count : ''}</Text>
                          <View style={styles.chartBarTrack}>
                            <View style={[styles.chartBarFill, { height: `${Math.max(pct * 100, 4)}%` as any }]} />
                          </View>
                          <Text style={styles.chartDayLabel}>{day.label}</Text>
                        </View>
                      )
                    })}
                  </View>
                  {!hasAny && (
                    <Text style={styles.chartEmptyNote}>No check-ins in the last 7 days yet.</Text>
                  )}
                </View>
              )
            })()}

            {/* Peak hours */}
            {analytics.peakHours.length > 0 && (
              <View style={styles.peakCard}>
                <Text style={styles.peakTitle}>⏰ Peak Hours</Text>
                <View style={styles.peakPills}>
                  {analytics.peakHours.map((h, i) => (
                    <View key={h} style={[styles.peakPill, i === 0 && styles.peakPillTop]}>
                      <Text style={[styles.peakPillText, i === 0 && styles.peakPillTextTop]}>{h}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {/* Promotion Performance */}
            {analytics.promoPerf.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Promotion Performance</Text>
                {analytics.promoPerf.map((p) => (
                  <View key={p.id} style={styles.perfRow}>
                    <View style={styles.perfLeft}>
                      <Text style={styles.perfTitle} numberOfLines={1}>{p.title}</Text>
                      {p.discount_label && <Text style={styles.perfSub}>{p.discount_label}</Text>}
                    </View>
                    <View style={styles.perfStat}>
                      <Text style={styles.perfNum}>{p.views}</Text>
                      <Text style={styles.perfLabel}>views</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Event Performance */}
            {analytics.eventPerf.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Event Performance</Text>
                {analytics.eventPerf.map((e) => (
                  <View key={e.id} style={styles.perfRow}>
                    <View style={styles.perfLeft}>
                      <Text style={styles.perfTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={styles.perfSub}>
                        {new Date(e.starts_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <View style={styles.perfStats}>
                      <View style={styles.perfStat}>
                        <Text style={styles.perfNum}>{e.rsvps}</Text>
                        <Text style={styles.perfLabel}>RSVPs</Text>
                      </View>
                      <View style={styles.perfStat}>
                        <Text style={[styles.perfNum, { color: '#22c55e' }]}>{e.checkins}</Text>
                        <Text style={styles.perfLabel}>showed up</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        </>)}

        {dashTab === 'overview' && (<>
        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionCard, styles.actionCardLive]}
            onPress={() => router.push('/venue/people' as any)}
          >
            <Text style={styles.actionEmoji}>👥</Text>
            <Text style={[styles.actionLabel, styles.actionLabelLive]}>Live People</Text>
            {stats.total > 0 && (
              <View style={styles.actionLiveBadge}>
                <Text style={styles.actionLiveBadgeText}>{stats.total}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/messages' as any)}>
            <Text style={styles.actionEmoji}>💬</Text>
            <Text style={styles.actionLabel}>Messages</Text>
            {venueMsgUnread > 0 && (
              <View style={styles.actionLiveBadge}>
                <Text style={styles.actionLiveBadgeText}>{venueMsgUnread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/edit' as any)}>
            <Text style={styles.actionEmoji}>✏️</Text>
            <Text style={styles.actionLabel}>Edit Venue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => venue && router.push(`/zone/event/create?zoneId=${venue.id}` as any)}>
            <Text style={styles.actionEmoji}>📅</Text>
            <Text style={styles.actionLabel}>Add Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/events' as any)}>
            <Text style={styles.actionEmoji}>🗓️</Text>
            <Text style={styles.actionLabel}>Manage Events</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/highlights' as any)}>
            <Text style={styles.actionEmoji}>⭐</Text>
            <Text style={styles.actionLabel}>Highlights</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/promotions' as any)}>
            <Text style={styles.actionEmoji}>🏷️</Text>
            <Text style={styles.actionLabel}>Promotions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/announcements' as any)}>
            <Text style={styles.actionEmoji}>📣</Text>
            <Text style={styles.actionLabel}>Announce</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/gallery' as any)}>
            <Text style={styles.actionEmoji}>📸</Text>
            <Text style={styles.actionLabel}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Footer note */}
        <Text style={styles.privacyNote}>
          🔒 Age + interest data is anonymous aggregate — you never see individual profiles.
        </Text>
        </>)}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },

  dashTabs: {
    flexDirection: 'row', gap: 6, marginBottom: 14,
    backgroundColor: '#0B1526', borderRadius: 12, padding: 4,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  dashTab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  dashTabOn: { backgroundColor: '#29B6F6' },
  dashTabText: { fontSize: 13, fontWeight: '700', color: '#7A93AC' },
  dashTabTextOn: { color: '#050A15' },

  glow: { position: 'absolute', borderRadius: 999, opacity: 0.08 },
  glowTop: { width: 400, height: 400, backgroundColor: '#29B6F6', top: -120, right: -100 },

  venueBanner: { width: '100%', height: 140 },
  venueAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#29B6F6' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerGreeting: { fontSize: 13, color: '#7A93AC', fontWeight: '500' },
  headerVenue: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: {
    backgroundColor: '#0D1B2E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#29B6F6' },
  signOutBtn: { padding: 8 },
  signOutText: { fontSize: 18, color: '#4A6580' },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' },
  // Each live feed (Pulse / Chat) scrolls inside its own pane so a busy night
  // doesn't force the venue to scroll the whole page to reach the other one.
  feedPane: { maxHeight: 360 },
  modRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modDelete: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ef444418', borderWidth: 1, borderColor: '#ef444430' },
  modDeleteText: { color: '#ef4444', fontSize: 13, fontWeight: '800' },
  modMute: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B30' },
  modMuteText: { fontSize: 13 },
  venueChatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  venueChatInput: { flex: 1, backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#D0E8F5', fontSize: 14 },
  venueChatSend: { backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  venueChatSendText: { color: '#050A15', fontSize: 13, fontWeight: '800' },

  mapCard: {
    backgroundColor: '#07101F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.2)',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapCardTitle: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  mapCardSub: { fontSize: 12, color: '#4A6580' },

  liveCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    alignItems: 'center',
    gap: 6,
  },
  liveCardActive: {
    borderColor: '#22c55e44',
    backgroundColor: '#0a1f0f',
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 32px rgba(34,197,94,0.08)' } as any : {}),
  },
  liveLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  liveDot: {
    position: 'absolute',
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#22c55e33',
  },
  liveDotCore: { width: 10, height: 10, borderRadius: 5 },
  liveDotCoreActive: { backgroundColor: '#22c55e' },
  liveDotCoreIdle: { backgroundColor: '#4A6580' },
  liveLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: '#4A6580' },
  liveLabelActive: { color: '#22c55e' },
  liveCount: { fontSize: 72, fontWeight: '900', color: '#1A2E4A', lineHeight: 80 },
  liveCountActive: { color: '#f8fafc' },
  liveSub: { fontSize: 14, color: '#4A6580', fontWeight: '500' },

  setupCard: {
    backgroundColor: '#0D1B2E', borderRadius: 16, padding: 24, borderWidth: 1,
    borderColor: '#29B6F630', alignItems: 'center', gap: 10,
  },
  setupEmoji: { fontSize: 36 },
  setupTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  setupSub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
  setupBtn: {
    backgroundColor: '#29B6F6', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
  },
  setupBtnText: { color: '#050A15', fontWeight: '800', fontSize: 14 },

  card: {
    backgroundColor: '#0D1B2E', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#1A2E4A', gap: 14,
  },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardHint: { fontSize: 12, color: '#7A93AC', marginTop: -8 },
  subscriberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subscriberName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#f0f8ff' },
  subscriberDate: { fontSize: 11, color: '#7A93AC' },
  monitorEmpty: { fontSize: 13, color: '#4A6580', fontStyle: 'italic', paddingVertical: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  featureLabel: { fontSize: 15, fontWeight: '700', color: '#f0f8ff' },
  recapLink: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#29B6F630',
  },
  recapLinkEmoji: { fontSize: 24 },
  recapLinkTitle: { fontSize: 15, fontWeight: '800', color: '#f0f8ff' },
  recapLinkSub: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  recapLinkArrow: { fontSize: 22, color: '#4A6580' },
  pulsePhotoBtn: {
    alignSelf: 'flex-start', backgroundColor: '#29B6F612', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#29B6F640',
  },
  pulsePhotoBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 13 },
  pulsePhotoPreviewWrap: { position: 'relative', alignSelf: 'flex-start' },
  pulsePhotoPreview: { width: 120, height: 120, borderRadius: 12, borderWidth: 1, borderColor: '#1A2E4A' },
  pulsePhotoRemove: {
    position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#050A15', borderWidth: 1, borderColor: '#1A2E4A',
    alignItems: 'center', justifyContent: 'center',
  },
  pulsePhotoRemoveText: { color: '#f8fafc', fontSize: 12, fontWeight: '800' },
  pulseInput: {
    backgroundColor: '#07101F', borderRadius: 12, padding: 12, minHeight: 70,
    color: '#f8fafc', fontSize: 15, borderWidth: 1, borderColor: '#1A2E4A', textAlignVertical: 'top',
  },
  pulseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pinToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinBox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#1A2E4A',
    backgroundColor: '#07101F', alignItems: 'center', justifyContent: 'center',
  },
  pinBoxOn: { borderColor: '#29B6F6', backgroundColor: '#29B6F622' },
  pinCheck: { color: '#29B6F6', fontSize: 13, fontWeight: '800' },
  pinLabel: { color: '#8EADC7', fontSize: 13, fontWeight: '600' },
  pulsePostBtn: { backgroundColor: '#29B6F6', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10 },
  pulsePostText: { color: '#050A15', fontWeight: '800', fontSize: 14 },
  photoReviewRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  photoReviewImg: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#07101F' },
  photoReviewBy: { fontSize: 13, fontWeight: '700', color: '#f0f8ff' },
  photoReviewNote: { fontSize: 12, color: '#7A93AC', fontStyle: 'italic' },
  photoReviewActions: { flexDirection: 'row', gap: 8 },
  photoRejectBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3A' },
  photoRejectText: { color: '#7A93AC', fontWeight: '700', fontSize: 12 },
  photoApproveBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: '#22c55e' },
  photoApproveText: { color: '#050A15', fontWeight: '800', fontSize: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  waitChip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  waitChipOn:  { borderColor: '#29B6F6', backgroundColor: '#29B6F620' },
  waitChipOff: { borderColor: '#4A6580', backgroundColor: '#1A2E4A' },
  waitChipText:    { fontSize: 13, fontWeight: '700', color: '#7A93AC' },
  waitChipTextOn:  { color: '#29B6F6' },
  waitChipTextOff: { color: '#cbd5e1' },
  customWaitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customWaitInput: {
    width: 88, backgroundColor: '#07101F', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    color: '#f8fafc', fontSize: 15, borderWidth: 1, borderColor: '#1A2E4A',
  },
  customWaitUnit: { color: '#7A93AC', fontSize: 13 },
  customWaitBtn: { marginLeft: 'auto', backgroundColor: '#1A2E4A', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1, borderColor: '#29B6F640' },
  customWaitBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 13 },
  barList: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { fontSize: 12, color: '#7A93AC', width: 60 },
  barTrack: { flex: 1, height: 6, backgroundColor: '#1A2E4A', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#29B6F6', borderRadius: 3 },
  barPct: { fontSize: 11, color: '#4A6580', width: 32, textAlign: 'right' },

  interestCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0A1628', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  interestTag: { fontSize: 13, color: '#8EADC7', fontWeight: '600' },
  interestBadge: {
    backgroundColor: '#29B6F620', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  interestCount: { fontSize: 11, color: '#29B6F6', fontWeight: '800' },

  emptyCard: {
    backgroundColor: '#0D1B2E', borderRadius: 16, padding: 32, borderWidth: 1,
    borderColor: '#1A2E4A', alignItems: 'center', gap: 10,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#0D1B2E', borderRadius: 14,
    padding: 18, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#1A2E4A',
    position: 'relative',
  },
  actionCardLive: { borderColor: '#22c55e40', backgroundColor: '#091a0f' },
  actionEmoji: { fontSize: 24 },
  actionLabel: { fontSize: 13, fontWeight: '700', color: '#8EADC7' },
  actionLabelLive: { color: '#22c55e' },
  actionLiveBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: '#22c55e', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
    minWidth: 22, alignItems: 'center',
  },
  actionLiveBadgeText: { fontSize: 11, fontWeight: '800', color: '#050A15' },

  privacyNote: { fontSize: 11, color: '#2A3F55', textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },

  todayCard: {
    backgroundColor: '#0D1B2E', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#1A2E4A',
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  todayLeft:  { flex: 1, gap: 2 },
  todayLabel: { fontSize: 10, fontWeight: '700', color: '#4A6580', letterSpacing: 1 },
  todayCount: { fontSize: 40, fontWeight: '900', color: '#f8fafc', lineHeight: 46 },
  todayYest:  { fontSize: 12, color: '#4A6580' },
  todayBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  todayBadgeUp:       { backgroundColor: '#22c55e18', borderColor: '#22c55e40' },
  todayBadgeDown:     { backgroundColor: '#ef444418', borderColor: '#ef444440' },
  todayBadgeText:     { fontSize: 12, fontWeight: '700' },
  todayBadgeTextUp:   { color: '#22c55e' },
  todayBadgeTextDown: { color: '#ef4444' },
  mixRow:     { flexDirection: 'row', alignItems: 'center' },
  mixItem:    { flex: 1, alignItems: 'center', gap: 2 },
  mixDivider: { width: 1, height: 48, backgroundColor: '#1A2E4A' },
  mixNum:     { fontSize: 32, fontWeight: '900', color: '#29B6F6' },
  mixNumReturn: { color: '#a855f7' },
  mixLabel:   { fontSize: 12, fontWeight: '700', color: '#f8fafc' },
  mixSub:     { fontSize: 11, color: '#4A6580' },
  mixBar:     { height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', marginTop: 8 },
  mixBarNew:    { backgroundColor: '#29B6F6' },
  mixBarReturn: { backgroundColor: '#a855f7' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1, backgroundColor: '#0D1B2E', borderRadius: 14,
    padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  metricNum:   { fontSize: 26, fontWeight: '900', color: '#29B6F6' },
  metricLabel: { fontSize: 10, color: '#7A93AC', textAlign: 'center', lineHeight: 14 },

  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' as any, justifyContent: 'flex-end' },
  chartBarCount: { fontSize: 9, color: '#29B6F6', fontWeight: '700', minHeight: 12 },
  chartBarTrack: {
    flex: 1, width: '80%', justifyContent: 'flex-end',
    backgroundColor: '#1A2E4A', borderRadius: 4, overflow: 'hidden',
  },
  chartBarFill: { backgroundColor: '#29B6F6', borderRadius: 4, width: '100%' },
  chartDayLabel: { fontSize: 9, color: '#4A6580', fontWeight: '600', marginTop: 4 },
  chartEmptyNote: { fontSize: 12, color: '#4A6580', textAlign: 'center', marginTop: 10 },

  peakCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  peakTitle: { fontSize: 13, fontWeight: '700', color: '#8EADC7', flex: 1 },
  peakPills: { flexDirection: 'row', gap: 6 },
  perfRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#0D1B2E',
  },
  perfLeft:   { flex: 1, gap: 2 },
  perfTitle:  { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  perfSub:    { fontSize: 11, color: '#4A6580' },
  perfStats:  { flexDirection: 'row', gap: 16 },
  perfStat:   { alignItems: 'center', gap: 1 },
  perfNum:    { fontSize: 18, fontWeight: '900', color: '#29B6F6' },
  perfLabel:  { fontSize: 10, color: '#4A6580' },
  peakPill: {
    backgroundColor: '#0A1628', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  peakPillTop: { backgroundColor: '#29B6F618', borderColor: '#29B6F640' },
  peakPillText: { fontSize: 12, color: '#7A93AC', fontWeight: '700' },
  peakPillTextTop: { color: '#29B6F6' },
  subStatCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#29B6F625', alignItems: 'center', gap: 2,
  },
  subStatCardGold: { borderColor: '#f59e0b40' },
  subStatNum:   { fontSize: 28, fontWeight: '900', color: '#29B6F6' },
  subStatLabel: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  subStatHint:  { fontSize: 12, color: '#7A93AC', textAlign: 'center' },
  statPairRow:  { flexDirection: 'row', gap: 10 },
  statPairItem: { flex: 1 },

  // Pending approval styles
  pendingGlow: {
    position: 'absolute', top: -100, right: -80,
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: '#f59e0b', opacity: 0.05,
  },
  pendingCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#f59e0b22',
    width: '100%',
    marginBottom: 16,
  },
  pendingIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#f59e0b0D',
    borderWidth: 1, borderColor: '#f59e0b30',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  pendingTitle: { fontSize: 22, fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  pendingSub: { fontSize: 14, color: '#7A93AC', textAlign: 'center', lineHeight: 22 },
  pendingDivider: { width: 48, height: 1, backgroundColor: '#1A2E4A', marginVertical: 4 },
  pendingHint: { fontSize: 13, color: '#4A6580', textAlign: 'center' },
  pendingEmail: { color: '#29B6F6', fontWeight: '600' },
  backHomeBtn: {
    borderWidth: 1, borderColor: '#1A2E4A',
    borderRadius: 14, padding: 16,
    alignItems: 'center',
  },
  backHomeBtnText: { color: '#7A93AC', fontWeight: '700', fontSize: 15 },
  deniedCard: { borderColor: '#ef444430' },
  deniedIconWrap: { backgroundColor: '#ef444415' },
  deniedTitle: { color: '#ef4444' },
  deniedReasonBox: {
    backgroundColor: '#ef444410', borderRadius: 10,
    borderWidth: 1, borderColor: '#ef444430',
    padding: 12, alignSelf: 'stretch', marginTop: 4,
  },
  deniedReasonLabel: { fontSize: 11, fontWeight: '700', color: '#ef4444', marginBottom: 4 },
  deniedReasonText: { fontSize: 13, color: '#f8fafc', lineHeight: 18 },

  closedCard: {
    backgroundColor: '#0D1B2E', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 12,
  },
  closedCardActive: { borderColor: '#ef444440', backgroundColor: '#1a0808' },
  closedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  closedLeft: { flex: 1, gap: 3 },
  closedLabel: { fontSize: 14, fontWeight: '800', color: '#f8fafc' },
  closedLabelActive: { color: '#ef4444' },
  closedSub: { fontSize: 12, color: '#7A93AC', lineHeight: 16 },
  closedMsgWrap: { gap: 8 },
  closedInput: {
    backgroundColor: '#0A1628', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 13, borderWidth: 1, borderColor: '#ef444440',
  },
  closedActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  closedCancel: { fontSize: 13, color: '#7A93AC' },
  closedSaveBtn: {
    backgroundColor: '#ef4444', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  closedSaveText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  closedMsgRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closedMsgText: { flex: 1, fontSize: 13, color: '#ef4444', lineHeight: 18, fontStyle: 'italic' },
  closedEditHint: { fontSize: 12, color: '#7A93AC' },
})
