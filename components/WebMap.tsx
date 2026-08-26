// Native map (iOS/Android) — Apple Maps on iOS via PROVIDER_DEFAULT, no API key.
// Mirrors the WebMap.web.tsx props contract exactly so NearbyMap doesn't branch.
// Metro resolves WebMap.web.tsx on web and this file on native.
import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions } from 'react-native'
import MapView, { Marker, Circle, Polygon, PROVIDER_DEFAULT, type Region } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import type { Zone } from '@/lib/zones'
import { venueStatus, STATUS_STYLE, SUBSCRIBED_COLOR, type VenueStatus } from '@/lib/venueStatus'


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

// Geofence shading opacity per status. The status itself and its colour live in
// lib/venueStatus.ts, shared with WebMap.web.tsx so the two can never disagree
// about what green means.
const HEAT_OPACITY: Record<VenueStatus, number> = {
  busy:   0.30,
  open:   0.22,
  nearby: 0.18,
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

  // A Marker with tracksViewChanges={false} is snapshotted once. Set it false
  // before the venue's avatar has decoded and the pin freezes as an empty disc
  // forever. So markers keep tracking until their image reports back, then stop
  // — which is where the render-cost saving actually matters.
  const [imageReady, setImageReady] = useState<Set<string>>(new Set())
  const markImageReady = useCallback((zoneId: string) => {
    setImageReady(prev => (prev.has(zoneId) ? prev : new Set(prev).add(zoneId)))
  }, [])

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
        // Dark fallback base in case tiles are slow to load; the CartoDB overlay
        // below sits on top and is what you actually see.
        userInterfaceStyle="dark"
        mapType="mutedStandard"
        showsPointsOfInterest={false}
        showsBuildings={false}
        onRegionChangeComplete={(r) => onMapMove?.(r.latitude, r.longitude)}
      >
        {/* No tile overlay. CARTO began watermarking its keyless basemap endpoint
            with "API KEY REQUIRED" stamped diagonally across every tile, served
            as a normal 200 so nothing errors and nothing warns — the map just
            quietly brands itself unlicensed.

            Rather than take on a metered tile vendor and a key that ships inside
            the bundle, this drops back to the native Apple basemap that MapView
            was already configured for below: mapType="mutedStandard" with
            userInterfaceStyle="dark". Free, no key, no quota, no attribution
            obligation, and it cannot be revoked out from under us the way this
            just was. */}
        {validZones.map(zone => {
          const status      = venueStatus(zone)
          const { color }   = STATUS_STYLE[status]
          const heatOpacity = HEAT_OPACITY[status]
          const subscribed  = subscribedIds.has(zone.id)
          const isSelected  = zone.id === selectedId
          const ring        = parseWktRing(zone.polygon_wkt)
          const center      = { latitude: zone.center_lat, longitude: zone.center_lng }
          // Nothing to wait for when the venue has no picture.
          const pinReady    = !zone.avatar_url || imageReady.has(zone.id)

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
                tracksViewChanges={!pinReady}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={styles.pinWrap}>
                  {/* The venue's profile picture is the pin; the ring carries its
                      status. Venues without a picture keep the old initial. */}
                  <View style={[styles.pin, { borderColor: isSelected ? '#fff' : color }]}>
                    {zone.avatar_url ? (
                      <Image
                        source={{ uri: zone.avatar_url }}
                        style={styles.pinImg}
                        onLoad={() => markImageReady(zone.id)}
                        // On error the fallback never arrives, so stop tracking
                        // anyway rather than leaving the marker redrawing forever.
                        onError={() => markImageReady(zone.id)}
                      />
                    ) : (
                      <Text style={[styles.pinLabel, { color }]}>
                        {zone.name[0]?.toUpperCase() ?? '?'}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.pinTail, { backgroundColor: isSelected ? '#fff' : color }]} />
                  {subscribed && (
                    <View style={styles.pinStar}>
                      <Text style={styles.pinStarText}>★</Text>
                    </View>
                  )}
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
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#050A15', overflow: 'hidden',
  },
  pinImg: { width: '100%', height: '100%' },
  pinLabel: { fontWeight: '900', fontSize: 15 },
  pinTail: { width: 4, height: 7, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginTop: -1 },
  pinStar: {
    position: 'absolute', top: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: SUBSCRIBED_COLOR, borderWidth: 2, borderColor: '#050A15',
    alignItems: 'center', justifyContent: 'center',
  },
  pinStarText: { fontSize: 8, lineHeight: 10, color: '#050A15', fontWeight: '900' },
  locateBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
    alignItems: 'center', justifyContent: 'center',
  },
})
