import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps'
import { router } from 'expo-router'
import { useLocation } from '@/hooks/useLocation'
import { fetchNearbyZones } from '@/lib/zones'
import ZoneCard from '@/components/ZoneCard'
import type { Zone } from '@/lib/zones'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const MAP_HEIGHT = SCREEN_HEIGHT * 0.45

export default function NearbyScreen() {
  const { location, loading: locLoading, error: locError } = useLocation()
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const mapRef = useRef<MapView>(null)
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
    mapRef.current?.animateToRegion({
      latitude: zone.center_lat,
      longitude: zone.center_lng,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 400)
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
        <Text style={styles.errorSub}>HereNow needs your location to show nearby venues.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={
            location
              ? {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }
              : undefined
          }
          showsUserLocation
          showsMyLocationButton={false}
          customMapStyle={darkMapStyle}
        >
          {zones.map((zone) => (
            <Marker
              key={zone.id}
              coordinate={{ latitude: zone.center_lat, longitude: zone.center_lng }}
              onPress={() => handlePinPress(zone)}
            >
              <View style={[styles.pin, selectedId === zone.id && styles.pinSelected]}>
                <Text style={styles.pinText} numberOfLines={1}>{zone.name}</Text>
              </View>
            </Marker>
          ))}

          {zones.map((zone) => (
            <Circle
              key={`circle-${zone.id}`}
              center={{ latitude: zone.center_lat, longitude: zone.center_lng }}
              radius={zone.radius_meters}
              strokeColor={selectedId === zone.id ? '#29B6F6' : '#29B6F622'}
              fillColor={selectedId === zone.id ? '#29B6F610' : '#29B6F606'}
              strokeWidth={1}
            />
          ))}
        </MapView>

        {/* Overlay header */}
        <View style={styles.mapHeader}>
          <Text style={styles.mapTitle}>Nearby</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/zone/create')}>
            <Text style={styles.addBtnText}>+ Venue</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {loading ? 'Loading…' : `${zones.length} venue${zones.length !== 1 ? 's' : ''} nearby`}
          </Text>
        </View>

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
            renderItem={({ item }) => (
              <ZoneCard
                zone={item}
                selected={selectedId === item.id}
                onPress={() => handleCardPress(item)}
              />
            )}
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
    </View>
  )
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7A93AC' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#050A15' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#0D1B2E' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A2E4A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1A2E4A' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050A15' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#050A15' },
  center:      { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center', gap: 12 },
  mapWrap:     { height: MAP_HEIGHT, position: 'relative' },
  map:         { ...StyleSheet.absoluteFillObject },
  mapHeader:   {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(5,10,21,0.7)',
  },
  mapTitle:    { fontSize: 24, fontWeight: '800', color: '#f8fafc' },
  addBtn:      {
    backgroundColor: '#0D1B2ECC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#29B6F644',
  },
  addBtnText:  { color: '#29B6F6', fontWeight: '700', fontSize: 13 },
  pin: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: '#29B6F6',
    maxWidth: 120,
  },
  pinSelected: {
    backgroundColor: '#29B6F6',
    borderColor: '#29B6F6',
  },
  pinText: { fontSize: 11, fontWeight: '700', color: '#f8fafc' },
  listSection: { flex: 1 },
  listHeader:  {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  listTitle:   { fontSize: 13, color: '#7A93AC', fontWeight: '600' },
  listLoader:  { paddingTop: 24, alignItems: 'center' },
  list:        { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  empty:       { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyEmoji:  { fontSize: 36 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptySub:    { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
  statusText:  { color: '#7A93AC', fontSize: 14, marginTop: 8 },
  errorEmoji:  { fontSize: 40 },
  errorTitle:  { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  errorSub:    { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
})
