import { useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native'
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps'
import { router } from 'expo-router'
import type { Zone } from '@/lib/zones'

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
  mapRef?: React.RefObject<MapView>
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
export const MAP_HEIGHT = SCREEN_HEIGHT * 0.45

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

export default function NearbyMap({ zones, location, selectedId, onPinPress, mapRef }: Props) {
  return (
    <View style={styles.mapWrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
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
            onPress={() => onPinPress(zone)}
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

      <View style={styles.header}>
        <Text style={styles.title}>Nearby</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/zone/create')}>
          <Text style={styles.addBtnText}>+ Venue</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  mapWrap: { height: MAP_HEIGHT, position: 'relative' },
  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(5,10,21,0.7)',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#f8fafc' },
  addBtn: {
    backgroundColor: '#0D1B2ECC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#29B6F644',
  },
  addBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 13 },
  pin: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: '#29B6F6',
    maxWidth: 120,
  },
  pinSelected: { backgroundColor: '#29B6F6', borderColor: '#29B6F6' },
  pinText: { fontSize: 11, fontWeight: '700', color: '#f8fafc' },
})
