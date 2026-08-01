import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from '@/components/BackButton'
import { placementLabel } from '@/lib/qr'
import {
  fetchPilotOverview, fetchVenuePerformance, fetchPlacementStats,
  type PilotOverview, type VenuePerformance, type PlacementStat,
} from '@/lib/adminAnalytics'

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export default function AdminAnalytics() {
  const insets = useSafeAreaInsets()
  const [overview, setOverview]   = useState<PilotOverview | null>(null)
  const [venues, setVenues]       = useState<VenuePerformance[]>([])
  const [placements, setPlacements] = useState<PlacementStat[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const [o, v, p] = await Promise.all([
      fetchPilotOverview(), fetchVenuePerformance(), fetchPlacementStats(),
    ])
    setOverview(o)
    setVenues(v)
    setPlacements(p)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const o = overview

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton />
        <Text style={styles.title}>Pilot Dashboard</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#29B6F6" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
        >
          {/* Headline cards */}
          <View style={styles.cards}>
            {stat('QR scans', o?.total_scans ?? 0, `${o?.scans_7d ?? 0} in 7d`)}
            {stat('Accounts', o?.total_accounts ?? 0, `${o?.accounts_7d ?? 0} in 7d`)}
            {stat('Check-ins', o?.total_checkins ?? 0, `${o?.checkins_7d ?? 0} in 7d`)}
            {stat('Weekly active', o?.wau ?? 0, 'WAU')}
            {stat('Monthly active', o?.mau ?? 0, 'MAU')}
            {stat('Subscriptions', o?.total_subscriptions ?? 0, `${o?.total_venues ?? 0} venues`)}
          </View>

          {/* Funnel */}
          <Text style={styles.section}>Funnel</Text>
          <View style={styles.panel}>
            {funnelRow('QR scans', o?.total_scans ?? 0, null)}
            <Text style={styles.funnelNote}>App Store visits + installs aren't measurable (Apple/Google don't expose them), so the funnel picks up at account creation.</Text>
            {funnelRow('Accounts created', o?.total_accounts ?? 0, null)}
            {funnelRow('Profile completed', o?.profiles_completed ?? 0, pct(o?.profiles_completed ?? 0, o?.total_accounts ?? 0))}
            {funnelRow('Checked in (activated)', o?.checked_in_users ?? 0, pct(o?.checked_in_users ?? 0, o?.total_accounts ?? 0))}
            {funnelRow('Repeat check-in', o?.repeat_users ?? 0, pct(o?.repeat_users ?? 0, o?.checked_in_users ?? 0))}
            {funnelRow('Multi-venue', o?.multi_venue_users ?? 0, pct(o?.multi_venue_users ?? 0, o?.checked_in_users ?? 0))}
          </View>

          {/* QR placement conversion */}
          <Text style={styles.section}>Which placement converts</Text>
          <View style={styles.panel}>
            {placements.length === 0 ? (
              <Text style={styles.empty}>No QR codes scanned yet.</Text>
            ) : placements.map((p) => (
              <View key={p.placement} style={styles.row}>
                <Text style={styles.rowLabel}>{placementLabel(p.placement)}</Text>
                <Text style={styles.rowValue}>{p.scans} scans</Text>
              </View>
            ))}
          </View>

          {/* Venue performance */}
          <Text style={styles.section}>Venue performance</Text>
          <View style={styles.panel}>
            <View style={[styles.vRow, styles.vHead]}>
              <Text style={[styles.vName, styles.vHeadText]}>Venue</Text>
              <Text style={[styles.vCell, styles.vHeadText]}>Chk</Text>
              <Text style={[styles.vCell, styles.vHeadText]}>Uniq</Text>
              <Text style={[styles.vCell, styles.vHeadText]}>Ret</Text>
              <Text style={[styles.vCell, styles.vHeadText]}>Scan</Text>
              <Text style={[styles.vCell, styles.vHeadText]}>Sub</Text>
            </View>
            {venues.length === 0 ? (
              <Text style={styles.empty}>No venues yet.</Text>
            ) : venues.map((v) => (
              <View key={v.zone_id} style={styles.vRow}>
                <Text style={styles.vName} numberOfLines={1}>{v.name}</Text>
                <Text style={styles.vCell}>{v.checkins}</Text>
                <Text style={styles.vCell}>{v.unique_visitors}</Text>
                <Text style={styles.vCell}>{v.returning_visitors}</Text>
                <Text style={styles.vCell}>{v.scans}</Text>
                <Text style={styles.vCell}>{v.subscriptions}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.footnote}>
            Check-ins come from the sessions table. Retention curves (D1/D7/D30) and
            activation timing land in the next pass once there's pilot data to make
            them meaningful.
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

function stat(label: string, value: number, sub: string) {
  return (
    <View style={styles.card} key={label}>
      <Text style={styles.cardValue}>{value.toLocaleString()}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardSub}>{sub}</Text>
    </View>
  )
}

function funnelRow(label: string, count: number, conv: number | null) {
  return (
    <View style={styles.funnelRow} key={label}>
      <Text style={styles.funnelLabel}>{label}</Text>
      <View style={styles.funnelRight}>
        <Text style={styles.funnelCount}>{count.toLocaleString()}</Text>
        {conv !== null && <Text style={styles.funnelPct}>{conv}%</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: '30%', minWidth: 100, backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14 },
  cardValue: { color: '#f8fafc', fontSize: 24, fontWeight: '800' },
  cardLabel: { color: '#8EADC7', fontSize: 13, fontWeight: '600', marginTop: 2 },
  cardSub: { color: '#5b7089', fontSize: 11, marginTop: 2 },
  section: { color: '#f8fafc', fontSize: 16, fontWeight: '800', marginTop: 14 },
  panel: { backgroundColor: '#0D1B2E', borderRadius: 14, padding: 6 },
  funnelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#0A1626' },
  funnelLabel: { color: '#cde0f0', fontSize: 14, flex: 1 },
  funnelRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  funnelCount: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  funnelPct: { color: '#29B6F6', fontSize: 13, fontWeight: '700', minWidth: 42, textAlign: 'right' },
  funnelNote: { color: '#5b7089', fontSize: 11, paddingHorizontal: 10, paddingVertical: 6, lineHeight: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0A1626' },
  rowLabel: { color: '#cde0f0', fontSize: 14 },
  rowValue: { color: '#29B6F6', fontSize: 14, fontWeight: '700' },
  empty: { color: '#7A93AC', fontSize: 13, padding: 12, textAlign: 'center' },
  vRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0A1626' },
  vHead: { borderBottomColor: '#1A2E4A' },
  vHeadText: { color: '#5b7089', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  vName: { flex: 1, color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  vCell: { width: 40, textAlign: 'center', color: '#cde0f0', fontSize: 13 },
  footnote: { color: '#5b7089', fontSize: 11, lineHeight: 16, marginTop: 12 },
})
