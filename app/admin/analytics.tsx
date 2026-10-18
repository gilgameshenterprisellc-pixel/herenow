import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from '@/components/BackButton'
import { placementLabel } from '@/lib/qr'
import {
  fetchPilotOverview, fetchVenuePerformance, fetchPlacementStats, fetchRetention, fetchAppStoreOverview,
  type PilotOverview, type VenuePerformance, type PlacementStat, type Retention, type AppStoreOverview,
} from '@/lib/adminAnalytics'
import { appStoreNote } from '@/lib/appStoreNote'

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

const RANGES: { label: string; days: number | null }[] = [
  { label: '7 days',   days: 7 },
  { label: '30 days',  days: 30 },
  { label: '90 days',  days: 90 },
  { label: 'All time', days: null },
]

export default function AdminAnalytics() {
  const insets = useSafeAreaInsets()
  const [overview, setOverview]   = useState<PilotOverview | null>(null)
  const [venues, setVenues]       = useState<VenuePerformance[]>([])
  const [placements, setPlacements] = useState<PlacementStat[]>([])
  const [retention, setRetention]   = useState<Retention | null>(null)
  const [appStore, setAppStore]     = useState<AppStoreOverview | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [days, setDays]           = useState<number | null>(null)  // null = all time

  const load = useCallback(async () => {
    const [o, v, p, r, a] = await Promise.all([
      fetchPilotOverview(days), fetchVenuePerformance(days), fetchPlacementStats(days), fetchRetention(),
      fetchAppStoreOverview(days),
    ])
    setOverview(o)
    setVenues(v)
    setPlacements(p)
    setRetention(r)
    setAppStore(a)
    setLoading(false)
    setRefreshing(false)
  }, [days])

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
          {/* Date range */}
          <View style={styles.filterRow}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r.label}
                style={[styles.filterPill, days === r.days && styles.filterPillActive]}
                onPress={() => setDays(r.days)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterText, days === r.days && styles.filterTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterNote}>Range applies to totals, funnel, placements and venues. WAU/MAU and retention are fixed windows.</Text>
          {(o?.excluded_accounts ?? 0) > 0 && (
            <Text style={styles.filterNote}>
              Real pilot users only: {o?.excluded_accounts} team, demo and venue accounts are left out of every number.
            </Text>
          )}

          {/* Headline cards */}
          <View style={styles.cards}>
            {stat('QR scans', o?.total_scans ?? 0, `${o?.scans_7d ?? 0} in 7d`)}
            {stat('Accounts', o?.total_accounts ?? 0, `${o?.accounts_7d ?? 0} in 7d`)}
            {stat('Visits', o?.total_checkins ?? 0, `${o?.checkins_7d ?? 0} in 7d`)}
            {stat('Weekly active', o?.wau ?? 0, 'WAU')}
            {stat('Monthly active', o?.mau ?? 0, 'MAU')}
            {stat('Subscriptions', o?.total_subscriptions ?? 0, `${o?.total_venues ?? 0} venues`)}
          </View>

          {/* Funnel */}
          <Text style={styles.section}>Funnel</Text>
          <View style={styles.panel}>
            {funnelRow('QR scans', o?.total_scans ?? 0, null)}
            {appStore?.connected && funnelRow('App Store page views', appStore.page_views, null)}
            {appStore?.connected && funnelRow('App Store downloads', appStore.first_downloads, null)}
            {appStoreNote(appStore).map((line) => (
              <Text key={line} style={[styles.funnelNote, line.includes('sync failed') && styles.funnelWarn]}>{line}</Text>
            ))}
            {funnelRow('Accounts created', o?.total_accounts ?? 0, null)}
            {funnelRow('Profile completed', o?.profiles_completed ?? 0, pct(o?.profiles_completed ?? 0, o?.total_accounts ?? 0))}
            {funnelRow('Checked in (activated)', o?.checked_in_users ?? 0, pct(o?.checked_in_users ?? 0, o?.total_accounts ?? 0))}
            {funnelRow('Came back another night', o?.repeat_users ?? 0, pct(o?.repeat_users ?? 0, o?.checked_in_users ?? 0))}
            {funnelRow('Visited 2+ venues', o?.multi_venue_users ?? 0, pct(o?.multi_venue_users ?? 0, o?.checked_in_users ?? 0))}
            <Text style={styles.funnelNote}>Every step is the same people: accounts created in the range, and what they went on to do.</Text>
          </View>

          {/* Retention & activation */}
          <Text style={styles.section}>Retention &amp; activation</Text>
          <View style={styles.panel}>
            {retentionRow('Came back on another night', retention?.d1, retention?.d1_kept, retention?.d1_of)}
            {retentionRow('Still checking in a week later', retention?.d7, retention?.d7_kept, retention?.d7_of)}
            {retentionRow('Still checking in a month later', retention?.d30, retention?.d30_kept, retention?.d30_of)}
            <Text style={styles.funnelNote}>
              Measured from each person's first check-in. A week later means they checked in
              again on a night at least 7 days after their first. Each row only counts people
              whose first check-in was long enough ago, so the rows have different totals.
            </Text>
            <View style={styles.row}><Text style={styles.rowLabel}>Visits per person</Text><Text style={styles.rowValue}>{retention?.avg_checkins_per_user ?? 0}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Venues per person</Text><Text style={styles.rowValue}>{retention?.avg_venues_per_user ?? 0}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Typical time checked in</Text><Text style={styles.rowValue}>{retention?.median_session_minutes ?? retention?.avg_session_minutes ?? 0} min</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Never checked in</Text><Text style={styles.rowValue}>{pct((o?.total_accounts ?? 0) - (o?.checked_in_users ?? 0), o?.total_accounts ?? 0)}%</Text></View>
          </View>

          {/* QR placement conversion */}
          <Text style={styles.section}>Which placement converts</Text>
          <View style={styles.panel}>
            {placements.length === 0 ? (
              <Text style={styles.empty}>No QR codes made yet. Create one per placement in Admin, QR codes.</Text>
            ) : placements.map((p) => (
              <View key={p.placement} style={styles.row}>
                <Text style={styles.rowLabel}>{placementLabel(p.placement)}</Text>
                <Text style={styles.rowValue}>{p.scans} scans</Text>
              </View>
            ))}
            <Text style={styles.funnelNote}>
              Only codes made in Admin, QR codes are counted. A QR that links straight to the
              App Store, like the launch flyer, opens Apple's page without passing through
              HereNow. Its scans can't be counted here, but the downloads it drives
              {appStore?.connected
                ? ' are in the App Store rows of the funnel above.'
                : ' show up in App Store Connect, under Analytics.'}
            </Text>
          </View>

          {/* Venue performance */}
          <Text style={styles.section}>Venue performance</Text>
          <View style={styles.panel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={[styles.vRow, styles.vHead]}>
                  <Text style={[styles.vName, styles.vHeadText]}>Venue</Text>
                  <Text style={[styles.vCell, styles.vHeadText]}>Vis</Text>
                  <Text style={[styles.vCell, styles.vHeadText]}>Uniq</Text>
                  <Text style={[styles.vCell, styles.vHeadText]}>Ret</Text>
                  <Text style={[styles.vCell, styles.vHeadText]}>Scan</Text>
                  <Text style={[styles.vCell, styles.vHeadText]}>Sgn</Text>
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
                    <Text style={styles.vCell}>{v.attributed_signups}</Text>
                    <Text style={styles.vCell}>{v.subscriptions}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
          <Text style={styles.legend}>Vis visits · Uniq unique visitors · Ret came back another night · Scan QR scans · Sgn signups driven · Sub subscriptions</Text>

          <Text style={styles.footnote}>
            A visit is one person at one venue on one night (Nashville time, a night runs
            until 6am), so re-checking in after the app drops you counts once. Team, demo
            and venue-owner accounts are left out, and so is an owner checking in at their
            own venue.
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

// A retention percentage is only as good as the number of people behind it, so
// the count always shows, and a cohort too small to trust says so.
function retentionRow(label: string, value?: number, kept?: number, of?: number) {
  const known = typeof of === 'number'
  return (
    <View style={styles.row} key={label}>
      <Text style={styles.rowLabel}>{label}</Text>
      {known && of === 0 ? (
        <Text style={styles.rowMuted}>Too early</Text>
      ) : (
        <View style={styles.retRight}>
          <Text style={styles.rowValue}>{value ?? 0}%</Text>
          {known && (
            <Text style={styles.rowMuted}>{kept ?? 0} of {of}{(of ?? 0) < 10 ? ' · small sample' : ''}</Text>
          )}
        </View>
      )}
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#0D1B2E' },
  filterPillActive: { backgroundColor: '#29B6F622', borderColor: '#29B6F6' },
  filterText: { color: '#8EADC7', fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#29B6F6' },
  filterNote: { color: '#5b7089', fontSize: 11, lineHeight: 15 },
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
  funnelWarn: { color: '#F59E0B' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0A1626' },
  rowLabel: { color: '#cde0f0', fontSize: 14 },
  rowValue: { color: '#29B6F6', fontSize: 14, fontWeight: '700' },
  rowMuted: { color: '#7A93AC', fontSize: 12 },
  retRight: { alignItems: 'flex-end', gap: 2 },
  empty: { color: '#7A93AC', fontSize: 13, padding: 12, textAlign: 'center' },
  vRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0A1626' },
  vHead: { borderBottomColor: '#1A2E4A' },
  vHeadText: { color: '#5b7089', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  vName: { width: 130, color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  vCell: { width: 44, textAlign: 'center', color: '#cde0f0', fontSize: 13 },
  legend: { color: '#5b7089', fontSize: 10, marginTop: 6, lineHeight: 14 },
  footnote: { color: '#5b7089', fontSize: 11, lineHeight: 16, marginTop: 12 },
})
