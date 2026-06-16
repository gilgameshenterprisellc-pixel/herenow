import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { useLocation } from '@/hooks/useLocation'
import { fetchNearbyZones } from '@/lib/zones'
import ZoneCard from '@/components/ZoneCard'
import type { Zone } from '@/lib/zones'

export default function NearbyScreen() {
  const { location, loading: locLoading, error: locError } = useLocation()
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (coords?: { latitude: number; longitude: number }) => {
    const pos = coords ?? location
    if (!pos) return
    setLoading(true)
    const nearby = await fetchNearbyZones(pos.latitude, pos.longitude, 50)
    setZones(nearby)
    setLoading(false)
  }

  useEffect(() => {
    if (location) load(location)
  }, [location])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (locLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text style={styles.statusText}>Finding your location…</Text>
      </View>
    )
  }

  if (locError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>📍</Text>
        <Text style={styles.errorTitle}>Location required</Text>
        <Text style={styles.errorSub}>HereNow needs your location to show nearby zones.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nearby</Text>
        {location && (
          <Text style={styles.headerSub}>
            {zones.length} zone{zones.length !== 1 ? 's' : ''} within 50km
          </Text>
        )}
      </View>

      <FlatList
        data={zones}
        keyExtractor={(z) => z.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />
        }
        renderItem={({ item }) => (
          <ZoneCard
            zone={item}
            onPress={() => router.push(`/zone/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌐</Text>
              <Text style={styles.emptyTitle}>No zones nearby</Text>
              <Text style={styles.emptySub}>Be the first to create one.</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#f8fafc' },
  headerSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  statusText: { color: '#64748b', fontSize: 14, marginTop: 8 },
  errorEmoji: { fontSize: 40 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  errorSub: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingHorizontal: 32 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 14, color: '#64748b' },
})
