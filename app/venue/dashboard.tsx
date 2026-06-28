import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Animated,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { fetchSubscriberCount } from '@/lib/venueSubscriptions'
import { platformConfirm } from '@/lib/confirm'

interface VenueZone {
  id: string
  name: string
  type: string | null
  center_lat: number | null
  center_lng: number | null
  member_count: number | null
}

interface AggregateStats {
  total: number
  ageRanges: Record<string, number>
  interests: Record<string, number>
}

interface DayCount { label: string; count: number }

interface Analytics {
  totalCheckins: number
  eventCount: number
  annoCount: number
  weekChart: DayCount[]
  peakHours: string[]
}

export default function VenueDashboard() {
  const insets = useSafeAreaInsets()
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [venue, setVenue]             = useState<VenueZone | null>(null)
  const [stats, setStats]             = useState<AggregateStats>({ total: 0, ageRanges: {}, interests: {} })
  const [ownerName, setOwnerName]         = useState('')
  const [venueStatus, setVenueStatus]     = useState<string | null>(null)
  const [denialReason, setDenialReason]   = useState<string | null>(null)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
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
      const { data: { user } } = await supabase.auth.getUser()
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
        const { data: sessions } = await supabase
          .from('sessions')
          .select('profiles(age_range, interest_tags)')
          .eq('zone_id', z.id)
          .is('checked_out_at', null)

        const ageRanges: Record<string, number> = {}
        const interests: Record<string, number> = {}
        let total = 0

        for (const s of (sessions ?? []) as any[]) {
          const p = s.profiles
          if (!p) continue
          total++
          if (p.age_range) ageRanges[p.age_range] = (ageRanges[p.age_range] ?? 0) + 1
          for (const tag of (p.interest_tags ?? [])) {
            interests[tag] = (interests[tag] ?? 0) + 1
          }
        }

        setStats({ total, ageRanges, interests })
        const subCount = await fetchSubscriberCount(z.id)
        setSubscriberCount(subCount)

        // Analytics queries — run in parallel
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const [totalRes, weekRes, eventsRes, annoRes] = await Promise.all([
          supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('zone_id', z.id),
          supabase.from('sessions').select('checked_in_at').eq('zone_id', z.id).gte('checked_in_at', weekAgo),
          supabase.from('venue_events').select('id', { count: 'exact', head: true }).eq('zone_id', z.id),
          supabase.from('venue_announcements').select('id', { count: 'exact', head: true }).eq('zone_id', z.id),
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

        setAnalytics({
          totalCheckins: totalRes.count ?? 0,
          eventCount: eventsRes.count ?? 0,
          annoCount: annoRes.count ?? 0,
          weekChart,
          peakHours,
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

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerGreeting}>Hey, {ownerName || 'there'} 👋</Text>
          <Text style={styles.headerVenue}>{venue?.name ?? 'Your Venue'}</Text>
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

        {/* Subscriber stat */}
        {venue && (
          <View style={styles.subStatCard}>
            <Text style={styles.subStatNum}>{subscriberCount}</Text>
            <Text style={styles.subStatLabel}>
              {subscriberCount === 1 ? 'follower' : 'followers'}
            </Text>
            <Text style={styles.subStatHint}>People subscribed to your venue</Text>
          </View>
        )}

        {/* Analytics */}
        {analytics && (
          <>
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

            {/* 7-day chart */}
            {analytics.weekChart.some((d) => d.count > 0) && (() => {
              const maxCount = Math.max(...analytics.weekChart.map((d) => d.count), 1)
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
          </>
        )}

        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/edit' as any)}>
            <Text style={styles.actionEmoji}>✏️</Text>
            <Text style={styles.actionLabel}>Edit Venue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => venue && router.push(`/zone/event/create?zoneId=${venue.id}` as any)}>
            <Text style={styles.actionEmoji}>📅</Text>
            <Text style={styles.actionLabel}>Add Event</Text>
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
        </View>

        {/* Footer note */}
        <Text style={styles.privacyNote}>
          🔒 Age + interest data is anonymous aggregate — you never see individual profiles.
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },

  glow: { position: 'absolute', borderRadius: 999, opacity: 0.08 },
  glowTop: { width: 400, height: 400, backgroundColor: '#29B6F6', top: -120, right: -100 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  headerLeft: { gap: 2 },
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
  content: { padding: 16, gap: 14, paddingBottom: 40 },

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
  },
  actionEmoji: { fontSize: 24 },
  actionLabel: { fontSize: 13, fontWeight: '700', color: '#8EADC7' },

  privacyNote: { fontSize: 11, color: '#2A3F55', textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },

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

  peakCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  peakTitle: { fontSize: 13, fontWeight: '700', color: '#8EADC7', flex: 1 },
  peakPills: { flexDirection: 'row', gap: 6 },
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
  subStatNum:   { fontSize: 32, fontWeight: '900', color: '#29B6F6' },
  subStatLabel: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  subStatHint:  { fontSize: 12, color: '#7A93AC' },

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
})
