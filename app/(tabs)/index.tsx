import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useLocation } from '@/hooks/useLocation'
import { fetchNearbyZones } from '@/lib/zones'
import ZoneCard from '@/components/ZoneCard'
import NearbyMap from '@/components/NearbyMap'
import { TAB_SAFE_BOTTOM } from './_layout'
import type { Zone } from '@/lib/zones'

export default function NearbyScreen() {
  const { location, loading: locLoading, error: locError } = useLocation()
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // mapRef only used on native — MapView type is only available there
  const mapRef = useRef<any>(null)
  const listRef = useRef<FlatList>(null)

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

  const handlePinPress = (zone: Zone) => {
    setSelectedId(zone.id)
    const idx = zones.findIndex((z) => z.id === zone.id)
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 })
    }
  }

  const handleCardPress = (zone: Zone) => {
    setSelectedId(zone.id)
    if (Platform.OS !== 'web') {
      mapRef.current?.animateToRegion({
        latitude: zone.center_lat,
        longitude: zone.center_lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 400)
    }
    router.push(`/zone/${zone.id}`)
  }

  if (locLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" size="large" />
        <Text style={styles.statusText}>Finding your location…</Text>
      </View>
    )
  }

  if (locError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>📍</Text>
        <Text style={styles.errorTitle}>Location required</Text>
        <Text style={styles.errorSub}>
          HereNow needs your location to show nearby venues.{'\n'}
          {Platform.OS === 'web'
            ? 'Allow location access in your browser.'
            : 'Allow location access when prompted.'}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <NearbyMap
        zones={zones}
        location={location}
        selectedId={selectedId}
        onPinPress={handlePinPress}
        mapRef={mapRef}
      />

      {loading ? (
        <View style={styles.listLoader}>
          <ActivityIndicator color="#29B6F6" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={zones}
          keyExtractor={(z) => z.id}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>
              <ZoneCard
                zone={item}
                selected={selectedId === item.id}
                onPress={() => handleCardPress(item)}
              />
            </Animated.View>
          )}
          ListHeaderComponent={
            zones.length > 0 ? (
              <Text style={styles.listLabel}>
                {zones.length} venue{zones.length !== 1 ? 's' : ''} nearby
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌐</Text>
              <Text style={styles.emptyTitle}>No venues nearby yet</Text>
              <Text style={styles.emptySub}>Be the first to create one.</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#050A15' },
  center:     { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center', gap: 12 },
  listLoader: { paddingTop: 24, alignItems: 'center' },
  list:       { paddingHorizontal: 14, paddingTop: 8, paddingBottom: TAB_SAFE_BOTTOM, gap: 10 },
  listLabel:  { fontSize: 12, color: '#4A6580', fontWeight: '600', paddingBottom: 8, paddingHorizontal: 2 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
  statusText: { color: '#7A93AC', fontSize: 14, marginTop: 8 },
  errorEmoji: { fontSize: 40 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  errorSub:   { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 },
})
