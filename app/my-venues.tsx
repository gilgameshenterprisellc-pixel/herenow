import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { fetchMyVenues, unsubscribeFromVenue, type VenueSubscription } from '@/lib/venueSubscriptions'
import { platformConfirm } from '@/lib/confirm'
import BackButton from '@/components/BackButton'

export default function MyVenuesScreen() {
  const insets = useSafeAreaInsets()
  const [venues, setVenues]       = useState<VenueSubscription[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchMyVenues()
    setVenues(data)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const handleUnfollow = (v: VenueSubscription) => {
    platformConfirm(
      `Unfollow ${v.zones?.name ?? 'this venue'}?`,
      "You won't see their promotions in your feed anymore.",
      async () => {
        await unsubscribeFromVenue(v.zone_id)
        setVenues((prev) => prev.filter((x) => x.id !== v.id))
      },
      { confirmText: 'Unfollow', destructive: true }
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} />
        <Text style={styles.title}>My Venues</Text>
        {venues.length > 0 && <Text style={styles.count}>{venues.length} following</Text>}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#29B6F6" size="large" />
        </View>
      ) : (
        <FlatList
          data={venues}
          keyExtractor={(v) => v.id}
          contentContainerStyle={[
            styles.list,
            Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardMain}
                onPress={() => router.push(`/zone/${item.zone_id}` as any)}
              >
                <View style={styles.venueIcon}>
                  <Ionicons name="business" size={20} color="#29B6F6" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.zones?.name ?? 'Venue'}</Text>
                  {item.zones?.type && (
                    <Text style={styles.cardType}>{item.zones.type}</Text>
                  )}
                  <Text style={styles.cardSince}>
                    Following since {new Date(item.subscribed_at).toLocaleDateString()}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.unfollowBtn} onPress={() => handleUnfollow(item)}>
                <Text style={styles.unfollowText}>Unfollow</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="business" size={22} color="#29B6F6" style={styles.emptyEmoji} />
              <Text style={styles.emptyTitle}>No venues followed yet</Text>
              <Text style={styles.emptySub}>
                Visit a venue and tap "+ Follow" to get their promos and announcements in your feed.
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  backBtn:  { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title:    { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  count:    { fontSize: 13, color: '#7A93AC' },
  list:     { padding: 16, gap: 10, paddingBottom: 60 },
  card: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
  },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  venueIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  venueIconText: { fontSize: 20 },
  cardInfo:  { flex: 1, gap: 2 },
  cardName:  { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  cardType:  { fontSize: 12, color: '#7A93AC', textTransform: 'capitalize' },
  cardSince: { fontSize: 11, color: '#4A6580' },
  unfollowBtn: {
    paddingHorizontal: 14, paddingVertical: 14,
    borderLeftWidth: 1, borderLeftColor: '#1A2E4A',
  },
  unfollowText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
})
