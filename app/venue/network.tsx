import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import WebMap from '@/components/WebMap'
import { fetchNearbyZones, type Zone } from '@/lib/zones'

const EMPTY_SET = new Set<string>()

export default function VenueNetworkScreen() {
  const insets = useSafeAreaInsets()
  const [zones, setZones]     = useState<Zone[]>([])
  const [ownZoneId, setOwnZoneId] = useState<string | null>(null)
  const [ownLoc, setOwnLoc]   = useState<{ latitude: number; longitude: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: own } = await supabase
      .from('zones')
      .select('id, center_lat, center_lng')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle()

    setOwnZoneId(own?.id ?? null)
    if (Number.isFinite(own?.center_lat) && Number.isFinite(own?.center_lng)) {
      setOwnLoc({ latitude: own!.center_lat as number, longitude: own!.center_lng as number })
    }

    // Center the scan on the owner's venue; wide radius so the whole city shows.
    const lat = own?.center_lat ?? 36.1627
    const lng = own?.center_lng ?? -86.7816
    const near = await fetchNearbyZones(lat, lng, 80)
    // Busiest first — that's the competitive signal a venue wants.
    near.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
    setZones(near)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const liveTotal = zones.reduce((sum, z) => sum + (z.member_count ?? 0), 0)

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Tonight's Scene</Text>
          <Text style={styles.sub}>{liveTotal} checked in across {zones.length} venue{zones.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" style={{ marginTop: 50 }} />
        ) : zones.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="partly-sunny" size={22} color="#29B6F6" style={styles.emptyEmoji} />
            <Text style={styles.emptyTitle}>Quiet out there</Text>
            <Text style={styles.emptySub}>No active venues nearby right now.</Text>
          </View>
        ) : (
          zones.map((z, i) => {
            const count = z.member_count ?? 0
            const isMine = z.id === ownZoneId
            const isLive = count > 0
            const isSel = z.id === selectedId
            return (
              <TouchableOpacity
                key={z.id}
                style={[styles.row, isMine && styles.rowMine, isSel && styles.rowSel]}
                activeOpacity={0.8}
                onPress={() => setSelectedId(isSel ? null : z.id)}
              >
                <Text style={styles.rank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{z.name}</Text>
                    {isMine && <Text style={styles.youTag}>YOU</Text>}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[z.category, z.wait_time_minutes != null ? `${z.wait_time_minutes}m wait` : null]
                      .filter(Boolean).join(' · ') || 'Venue'}
                  </Text>
                </View>
                <View style={styles.countWrap}>
                  <View style={[styles.dot, { backgroundColor: isLive ? '#22c55e' : '#4A6580' }]} />
                  <Text style={[styles.count, isLive && styles.countLive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            )
          })
        )}
        {!loading && zones.length > 0 && (
          <View style={styles.mapWrap}>
            <WebMap
              zones={zones}
              location={ownLoc}
              selectedId={selectedId}
              onPinPress={(z) => setSelectedId(z.id)}
              subscribedIds={EMPTY_SET}
            />
          </View>
        )}

        {!loading && zones.length > 0 && (
          <Text style={styles.footNote}>
            Live counts across the network. If a nearby spot is packed and you're quiet, that's your cue to run a promo.
          </Text>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  sub: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  content: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  rowMine: { borderColor: '#29B6F6', backgroundColor: '#29B6F60D' },
  rowSel: { borderColor: '#29B6F6', backgroundColor: '#29B6F61A' },
  mapWrap: { height: 300, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1A2E4A', marginBottom: 4 },
  rank: { width: 22, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#4A6580' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: '#f0f8ff', flexShrink: 1 },
  youTag: {
    fontSize: 9, fontWeight: '800', color: '#29B6F6', letterSpacing: 1,
    backgroundColor: '#29B6F61A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  meta: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  countWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  count: { fontSize: 18, fontWeight: '900', color: '#7A93AC', minWidth: 24, textAlign: 'right' },
  countLive: { color: '#22c55e' },
  footNote: { fontSize: 11, color: '#4A6580', lineHeight: 16, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center' },
})
