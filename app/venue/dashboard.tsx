import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Animated, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface VenueZone {
  id: string
  name: string
  type: string
  lat: number
  lng: number
  member_count: number | null
}

interface AggregateStats {
  total: number
  ageRanges: Record<string, number>
  interests: Record<string, number>
}

export default function VenueDashboard() {
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [venue, setVenue]           = useState<VenueZone | null>(null)
  const [stats, setStats]           = useState<AggregateStats>({ total: 0, ageRanges: {}, interests: {} })
  const [ownerName, setOwnerName]   = useState('')
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const [{ data: profile }, { data: zones }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      supabase.from('zones').select('*').eq('owner_id', user.id).limit(1),
    ])

    setOwnerName(profile?.display_name ?? '')
    const z = zones?.[0] ?? null
    setVenue(z)

    if (z) {
      // Pull active sessions for this zone to build aggregate stats
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
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleSignOut = async () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut()
        router.replace('/(auth)/login')
      }},
    ])
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

  return (
    <View style={styles.container}>
      {/* Ambient glow */}
      <View style={[styles.glow, styles.glowTop]} />

      {/* Header */}
      <View style={styles.header}>
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

        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/venue/edit' as any)}>
            <Text style={styles.actionEmoji}>✏️</Text>
            <Text style={styles.actionLabel}>Edit Venue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => Alert.alert('Coming soon', 'Event creation is coming in the next update.')}>
            <Text style={styles.actionEmoji}>📅</Text>
            <Text style={styles.actionLabel}>Add Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => Alert.alert('Coming soon', 'QR code sharing is coming in the next update.')}>
            <Text style={styles.actionEmoji}>📲</Text>
            <Text style={styles.actionLabel}>Share QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => Alert.alert('Coming soon', 'Analytics are coming in the next update.')}>
            <Text style={styles.actionEmoji}>📊</Text>
            <Text style={styles.actionLabel}>Analytics</Text>
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
    paddingTop: 60,
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
})
