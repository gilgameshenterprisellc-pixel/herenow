import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface Stats {
  totalUsers: number
  totalVenues: number
  pendingVenues: number
  pendingSubmissions: number
  openReports: number
  openUserReports: number
  mutedUsers: number
}

export default function AdminOverview() {
  const insets = useSafeAreaInsets()
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const [
      { count: totalUsers },
      { count: totalVenues },
      { count: pendingVenues },
      { count: pendingSubmissions },
      { count: openReports },
      { count: openUserReports },
      { count: mutedUsers },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('zones').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('venue_status', 'pending'),
      supabase.from('venue_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('safety_reports').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_muted', true),
    ])

    setStats({
      totalUsers:      totalUsers ?? 0,
      totalVenues:     totalVenues ?? 0,
      pendingVenues:   pendingVenues ?? 0,
      pendingSubmissions: pendingSubmissions ?? 0,
      openReports:     (openReports ?? 0) + (openUserReports ?? 0),
      openUserReports: openUserReports ?? 0,
      mutedUsers:      mutedUsers ?? 0,
    })
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const statCard = (label: string, value: number, warn = false) => (
    <View style={[styles.statCard, warn && value > 0 && styles.statCardWarn]}>
      <Text style={[styles.statValue, warn && value > 0 && styles.statValueWarn]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>🛡️ Admin Panel</Text>
        <Text style={styles.headerSub}>HereNow Operations</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
        ) : (
          <>
            <View style={styles.statsGrid}>
              {statCard('Total Users', stats?.totalUsers ?? 0)}
              {statCard('Active Venues', stats?.totalVenues ?? 0)}
              {statCard('Pending Approval', stats?.pendingVenues ?? 0, true)}
              {statCard('Open Reports', stats?.openReports ?? 0, true)}
              {statCard('Muted Users', stats?.mutedUsers ?? 0)}
            </View>

            <Text style={styles.sectionTitle}>ACTIONS</Text>

            <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/admin/venues' as any)}>
              <View style={styles.actionLeft}>
                <Text style={styles.actionEmoji}>🏢</Text>
                <View>
                  <Text style={styles.actionTitle}>Venue Approvals</Text>
                  <Text style={styles.actionSub}>Review and approve pending venue applications</Text>
                </View>
              </View>
              {(stats?.pendingVenues ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{stats!.pendingVenues}</Text>
                </View>
              )}
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/admin/submissions' as any)}>
              <View style={styles.actionLeft}>
                <Text style={styles.actionEmoji}>🗺️</Text>
                <View>
                  <Text style={styles.actionTitle}>Venue Suggestions</Text>
                  <Text style={styles.actionSub}>User-nominated venues to review and go live</Text>
                </View>
              </View>
              {(stats?.pendingSubmissions ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{stats!.pendingSubmissions}</Text>
                </View>
              )}
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/admin/reports' as any)}>
              <View style={styles.actionLeft}>
                <Text style={styles.actionEmoji}>🚩</Text>
                <View>
                  <Text style={styles.actionTitle}>Reports Queue</Text>
                  <Text style={styles.actionSub}>Flagged content and user safety reports</Text>
                </View>
              </View>
              {(stats?.openReports ?? 0) > 0 && (
                <View style={[styles.badge, styles.badgeRed]}>
                  <Text style={styles.badgeText}>{stats!.openReports}</Text>
                </View>
              )}
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/admin/users' as any)}>
              <View style={styles.actionLeft}>
                <Text style={styles.actionEmoji}>👥</Text>
                <View>
                  <Text style={styles.actionTitle}>User Management</Text>
                  <Text style={styles.actionSub}>Search users, view profiles, mute or ban</Text>
                </View>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>HereNow Admin v1 · For Jacob & Jamie</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  headerSub:   { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 12, paddingBottom: 60 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    minWidth: 100,
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statCardWarn: { borderColor: '#f59e0b44' },
  statValue: { fontSize: 26, fontWeight: '900', color: '#f8fafc' },
  statValueWarn: { color: '#f59e0b' },
  statLabel: { fontSize: 11, color: '#7A93AC', textAlign: 'center' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A93AC',
    letterSpacing: 1,
    marginTop: 8,
  },
  actionRow: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionEmoji: { fontSize: 24 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  actionSub:   { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  badge: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeRed: { backgroundColor: '#ef4444' },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#050A15' },
  arrow: { fontSize: 20, color: '#4A6580' },
  footer: { marginTop: 24, alignItems: 'center' },
  footerText: { fontSize: 11, color: '#4A6580' },
})
