import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useToast } from '@/contexts/ToastContext'
import { approveContest, fetchHostContests, type Contest } from '@/lib/contests'
import { statusLabel, withAlpha } from '@/lib/contestFormat'
import BackButton from '@/components/BackButton'
import { LiveDot } from '@/components/LiveContestCard'

// A host's contests: a venue's (?zoneId=) or an organization's (?orgId=).
// A venue also sees contests organizations want to run there, waiting on its OK.

export default function ManageContestsScreen() {
  const { zoneId, orgId } = useLocalSearchParams<{ zoneId?: string; orgId?: string }>()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [rows, setRows] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchHostContests({ zoneId, orgId })
    setRows(data)
    setLoading(false)
  }, [zoneId, orgId])

  // Reload on every visit, so a contest made or ended elsewhere shows up.
  useFocusEffect(useCallback(() => { load() }, [load]))

  const onApprove = async (c: Contest) => {
    const res = await approveContest(c.id, true)
    if (!res.ok) { showToast(res.error ?? 'Could not approve it.', 'error'); return }
    showToast('Approved', 'success')
    load()
  }

  const newHref = orgId ? `/contest/edit?orgId=${orgId}` : `/contest/edit?zoneId=${zoneId}`
  const pending = zoneId ? rows.filter((r) => !r.venue_approved) : []
  const rest = zoneId ? rows.filter((r) => r.venue_approved) : rows

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BackButton />
        <Text style={styles.headerTitle}>Contests</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#29B6F6"
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}
      >
        <View style={styles.intro}>
          <Ionicons name="trophy" size={22} color="#29B6F6" />
          <Text style={styles.introText}>
            Run a live contest with sign-ups and a leaderboard everyone checked in can watch:
            bull riding, darts, trivia, anything with a score.
          </Text>
        </View>

        <TouchableOpacity style={styles.newBtn} onPress={() => router.push(newHref as any)}>
          <Ionicons name="add" size={20} color="#050A15" />
          <Text style={styles.newText}>New contest</Text>
        </TouchableOpacity>

        {loading ? <ActivityIndicator color="#29B6F6" style={{ marginTop: 24 }} /> : null}

        {pending.length > 0 ? (
          <>
            <Text style={styles.section}>WAITING FOR YOUR OK</Text>
            {pending.map((c) => (
              <View key={c.id} style={[styles.row, { borderColor: '#F5B70055' }]}>
                <TouchableOpacity style={{ flex: 1, gap: 2 }} onPress={() => router.push(`/contest/${c.id}` as any)}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{c.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {c.presented_by ? `From ${c.presented_by}` : 'From an organization'} · {statusLabel(c.status)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.approveBtn} onPress={() => onApprove(c)}>
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : null}

        {!loading && rest.length === 0 && pending.length === 0 ? (
          <Text style={styles.empty}>No contests yet.</Text>
        ) : null}

        {rest.length > 0 ? <Text style={styles.section}>YOUR CONTESTS</Text> : null}
        {rest.map((c) => (
          <TouchableOpacity key={c.id} style={styles.row} onPress={() => router.push(`/contest/run/${c.id}` as any)}>
            <View style={[styles.dotWrap, { backgroundColor: withAlpha(c.accent_color, 0.14) }]}>
              <LiveDot color={c.accent_color} still={c.status !== 'live'} size={6} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{c.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {statusLabel(c.status)} · {c.entry_count} signed up
                {!c.venue_approved ? ' · waiting on the venue' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#4A6580" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#F8FAFC' },
  content: {
    padding: 16, gap: 10,
    ...Platform.select({ web: { maxWidth: 680, alignSelf: 'center', width: '100%' } as any, default: {} }),
  },
  intro: {
    flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14,
    backgroundColor: '#29B6F610', borderWidth: 1, borderColor: '#29B6F633',
  },
  introText: { flex: 1, fontSize: 13, color: '#CBD5E1', lineHeight: 19 },
  newBtn: {
    height: 52, borderRadius: 14, backgroundColor: '#29B6F6', flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  newText: { fontSize: 16, fontWeight: '900', color: '#050A15' },
  section: { fontSize: 11, fontWeight: '900', color: '#7A93AC', letterSpacing: 1.4, marginTop: 14 },
  empty: { fontSize: 14, color: '#4A6580', textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
  },
  dotWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
  rowSub: { fontSize: 12, color: '#7A93AC' },
  approveBtn: { paddingHorizontal: 14, height: 38, borderRadius: 10, backgroundColor: '#22C55E', justifyContent: 'center' },
  approveText: { fontSize: 13, fontWeight: '900', color: '#050A15' },
})
