// Native map (iOS/Android) — Apple Maps on iOS via PROVIDER_DEFAULT, no API key.
// Mirrors the WebMap.web.tsx props contract exactly so NearbyMap doesn't branch.
// Metro resolves WebMap.web.tsx on web and this file on native.
import { useEffect, useRef, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native'
import MapView, { Marker, Circle, Polygon, PROVIDER_DEFAULT, type Region } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import type { Zone } from '@/lib/zones'

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
  subscribedIds: Set<string>
  onMapMove?: (lat: number, lng: number) => void
  recenterTick?: number
}

/**
 * Map height, proportional to the screen rather than a fixed 420.
 *
 * Jacob: "Under the map where the venue cards are is really small. I can foresee
 * this being an issue the more venues we have. It's really hard to scroll on them
 * considering the map doesn't move."
 *
 * He was right about the cause. The map is a fixed-height sibling ABOVE the venue
 * list, not part of the scroll, so it never moves and whatever it doesn't use is
 * all the list ever gets. On a 6.1" phone, 420px of map plus the header and the
 * 108px tab inset left roughly one and a half cards visible — and that shrinks on
 * smaller devices, where 420 was a much bigger share of the screen.
 *
 * Scaling to ~38% of screen height gives the list roughly 100px more room on a
 * standard phone and far more on small ones, while the clamp keeps the map
 * usable on tiny screens and stops it ballooning on tablets.
 *
 * Deliberately NOT solved by moving the map into the list header so it scrolls
 * away: that puts a pannable map inside a vertical scroll view, and the gesture
 * conflict lands right next to the react-native-worklets 0.5.1 pin that
 * stabilised the launch crash. Wrong week to bet the beta on that.
 */
const { height: SCREEN_H } = Dimensions.get('window')
export const WEB_MAP_HEIGHT = Math.round(
  Math.min(420, Math.max(260, SCREEN_H * 0.38))
)

type Tier = 'subscribed' | 'live' | 'regular'

function getTier(zone: Zone, subscribedIds: Set<string>): Tier {
  if (subscribedIds.has(zone.id)) return 'subscribed'
  if ((zone.member_count ?? 0) > 0) return 'live'
  return 'regular'
}

const TIER_STYLE: Record<Tier, { color: string; heatOpacity: number }> = {
  subscribed: { color: '#f59e0b', heatOpacity: 0.30 },
  live:       { color: '#22c55e', heatOpacity: 0.22 },
  regular:    { color: '#29B6F6', heatOpacity: 0.18 },
}

// Parse PostGIS WKT POLYGON((lng lat, ...)) → {latitude, longitude}[] ring
function parseWktRing(wkt: string | null | undefined): { latitude: number; longitude: number }[] {
  if (!wkt) return []
  const m = wkt.match(/POLYGON\s*\(\(([^)]+)\)\)/i)
  if (!m) return []
  return m[1].split(',').flatMap(pair => {
    const parts = pair.trim().split(/\s+/)
    const lng = parseFloat(parts[0])
    const lat = parseFloat(parts[1])
    return isNaN(lat) || isNaN(lng) ? [] : [{ latitude: lat, longitude: lng }]
  })
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const USA_CENTER = { latitude: 39.8283, longitude: -98.5795 }

export default function WebMap({
  zones, location, selectedId, onPinPress, subscribedIds, onMapMove, recenterTick,
}: Props) {
  const mapRef = useRef<MapView>(null)

  // react-native-maps hard-crashes (native) on a NaN/null marker coordinate.
  // A single zone with missing coords would take the whole app down, so only
  // ever hand the map zones with valid, finite lat/lng.
  const validZones = useMemo(
    () => zones.filter(z => Number.isFinite(z.center_lat) && Number.isFinite(z.center_lng)),
    [zones]
  )

  const initialRegion: Region = useMemo(() => ({
    latitude:       location?.latitude  ?? USA_CENTER.latitude,
    longitude:      location?.longitude ?? USA_CENTER.longitude,
    latitudeDelta:  location ? 0.05 : 40,
    longitudeDelta: location ? 0.05 : 40,
  }), []) // initial only — live moves handled by animateToRegion below

  // Recenter on user when the tab regains focus (recenterTick increments)
  useEffect(() => {
    if (!recenterTick || !location || !mapRef.current) return
    mapRef.current.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 500)
    // Match web: refetch nearby venues after recentering
    onMapMove?.(location.latitude, location.longitude)
  }, [recenterTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pan to a selected venue
  useEffect(() => {
    if (!selectedId || !mapRef.current) return
    const zone = zones.find(z => z.id === selectedId)
    if (!zone || !Number.isFinite(zone.center_lat) || !Number.isFinite(zone.center_lng)) return
    mapRef.current.animateToRegion({
      latitude: zone.center_lat,
      longitude: zone.center_lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 400)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocate = () => {
    if (!location || !mapRef.current) return
    mapRef.current.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 500)
    onMapMove?.(location.latitude, location.longitude)
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        // Keep the map app-specific: only participating venues should be
        // identifiable, not real-world businesses (Jacob — no Shell station).
        mapType="mutedStandard"
        showsPointsOfInterest={false}
        showsBuildings={false}
        onRegionChangeComplete={(r) => onMapMove?.(r.latitude, r.longitude)}
      >
        {validZones.map(zone => {
          const tier = getTier(zone, subscribedIds)
          const { color, heatOpacity } = TIER_STYLE[tier]
          const isSelected = zone.id === selectedId
          const ring = parseWktRing(zone.polygon_wkt)
          const center = { latitude: zone.center_lat, longitude: zone.center_lng }

          return (
            <View key={zone.id}>
              {ring.length >= 3 ? (
                <Polygon
                  coordinates={ring}
                  fillColor={hexToRgba(color, heatOpacity * 0.6)}
                  strokeColor={color}
                  strokeWidth={2}
                />
              ) : (
                <Circle
                  center={center}
                  radius={zone.radius_meters ?? 20}
                  fillColor={hexToRgba(color, heatOpacity)}
                  strokeColor={color}
                  strokeWidth={2}
                />
              )}
              <Marker
                coordinate={center}
                onPress={() => onPinPress(zone)}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={styles.pinWrap}>
                  <View
                    style={[
                      styles.pin,
                      { backgroundColor: isSelected ? '#fff' : color, borderColor: isSelected ? color : '#050A15' },
                    ]}
                  >
                    <Text style={[styles.pinLabel, { color: isSelected ? color : '#050A15' }]}>
                      {tier === 'subscribed' ? '★' : (zone.name[0]?.toUpperCase() ?? '?')}
                    </Text>
                  </View>
                  <View style={[styles.pinTail, { backgroundColor: isSelected ? '#fff' : color }]} />
                </View>
              </Marker>
            </View>
          )
        })}
      </MapView>

      {location && (
        <TouchableOpacity style={styles.locateBtn} onPress={handleLocate} activeOpacity={0.8}>
          <Ionicons name="locate" size={20} color="#29B6F6" />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: WEB_MAP_HEIGHT, backgroundColor: '#060D1A' },
  pinWrap: { alignItems: 'center' },
  pin: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
  },
  pinLabel: { fontWeight: '900', fontSize: 13 },
  pinTail: { width: 3, height: 7, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginTop: -1 },
  locateBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
    alignItems: 'center', justifyContent: 'center',
  },
})
