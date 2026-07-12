import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  Animated,
  ScrollView,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useLocation } from '@/hooks/useLocation'
import { fetchNearbyZones, searchZonesByName } from '@/lib/zones'
import { fetchMyVenues } from '@/lib/venueSubscriptions'
import { supabase } from '@/lib/supabase'
import ZoneCard from '@/components/ZoneCard'
import NearbyMap from '@/components/NearbyMap'
import AnimatedBackground from '@/components/AnimatedBackground'
import { TAB_SAFE_BOTTOM } from './_layout'
import type { Zone } from '@/lib/zones'

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)}m away`
  return `${(meters / 1000).toFixed(1)}km away`
}

// Haversine: straight-line surface distance between two lat/lng points in meters
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Re-pins distance_meters to the user's real GPS position so it never
// changes as the user pans/zooms the map.
function withRealDistance(zones: Zone[], userLat: number, userLng: number): Zone[] {
  return zones.map(z => ({
    ...z,
    distance_meters: haversineMeters(userLat, userLng, z.center_lat, z.center_lng),
  }))
}

function TrendingStrip({ zones, onPress }: { zones: Zone[]; onPress: (id: string) => void }) {
  const trending = zones
    .filter(z => (z.member_count ?? 0) > 0)
    .sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
    .slice(0, 5)

  if (trending.length === 0) return null

  return (
    <View style={styles.trendingWrap}>
      <Text style={styles.trendingTitle}>🔥 Trending Now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
        {trending.map(z => (
          <TouchableOpacity
            key={z.id}
            style={styles.trendingPill}
            onPress={() => onPress(z.id)}
            activeOpacity={0.75}
          >
            <View style={styles.trendingDot} />
            <Text style={styles.trendingName} numberOfLines={1}>{z.name}</Text>
            <Text style={styles.trendingCount}>{z.member_count}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

function TypeLabel({ type }: { type?: string | null }) {
  if (!type) return null
  const labels: Record<string, string> = {
    bar: 'Bar', restaurant: 'Restaurant', cafe: 'Coffee Shop',
    venue: 'Event Space', gym: 'Gym', other: 'Venue',
  }
  return (
    <View style={preview.typePill}>
      <Text style={preview.typeText}>{labels[type] ?? type}</Text>
    </View>
  )
}

export default function NearbyScreen() {
  const { location, loading: locLoading, error: locError } = useLocation()
  const [zones, setZones]               = useState<Zone[]>([])
  const [loading, setLoading]           = useState(false)
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [isVenueOwner, setIsVenueOwner] = useState(false)
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<Zone[]>([])
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [mapRecenterTick, setMapRecenterTick] = useState(0)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mapRef  = useRef<any>(null)
  const listRef = useRef<FlatList>(null)
  const isMountedFocus    = useRef(false)
  const locationLoadedRef = useRef(false)  // load zones near user only once on first fix

  // When user navigates back to this tab, snap map back to their location
  useFocusEffect(
    useCallback(() => {
      if (!isMountedFocus.current) { isMountedFocus.current = true; return }
      setMapRecenterTick(t => t + 1)
    }, [])
  )

  // Preview card animation
  const slideAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: selectedId ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start()
  }, [selectedId])

  const cardTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [220, 0],
  })
  const cardOpacity = slideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.6, 1],
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('is_venue_owner').eq('id', user.id)
        .maybeSingle().then(({ data }) => {
          setIsVenueOwner(data?.is_venue_owner ?? false)
        })
    })
  }, [])

  // Subscribed venue IDs for map tier highlighting
  useEffect(() => {
    fetchMyVenues().then(subs => {
      setSubscribedIds(new Set(subs.map(s => s.zone_id)))
    })
  }, [])

  const load = async (coords?: { latitude: number; longitude: number }) => {
    const pos = coords ?? location
    if (!pos) return
    setLoading(true)
    const nearby = await fetchNearbyZones(pos.latitude, pos.longitude, 50)
    // Re-anchor all distances to the user's actual GPS fix, not the fetch center.
    // Without this, zone distances change as the user pans/zooms the map since
    // zones_near() computes distance from the map-center point it was given.
    const userPos = location ?? pos
    setZones(withRealDistance(nearby, userPos.latitude, userPos.longitude))
    setLoading(false)
  }

  // Load zones near user only on first location fix.
  // watchPosition fires continuously — we must NOT let every GPS ping wipe
  // whatever the user panned the map to see. After first load, zone updates
  // come exclusively from handleMapMove (user pan / ⊕ button / tab focus).
  useEffect(() => {
    if (!location || locationLoadedRef.current) return
    locationLoadedRef.current = true
    load(location)
  }, [location])

  // Global DB search — fires on every keystroke (debounced 300ms)
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    searchDebounce.current = setTimeout(() => {
      searchZonesByName(q).then(setSearchResults)
    }, 300)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [searchQuery])

  // When searching, show DB results; otherwise show nearby zones — optionally chip-filtered
  // Multi-select: show venues that match ALL selected chips (AND logic)
  const baseZones = searchQuery.trim() ? searchResults : zones
  const filteredZones = selectedChips.length > 0
    ? baseZones.filter(z => selectedChips.every(c => z.chips?.includes(c)))
    : baseZones

  // Look in both pools so search-result taps populate the preview card
  const selectedZone =
    [...zones, ...searchResults].find(z => z.id === selectedId) ?? null

  // When user pans the map, refetch venues centered on the new position.
  // Always re-anchor distances to the user's real GPS fix so they don't change on zoom.
  const handleMapMove = async (lat: number, lng: number) => {
    if (searchQuery.trim()) return  // don't clobber search results
    const nearby = await fetchNearbyZones(lat, lng, 50)
    const userPos = location
    setZones(userPos ? withRealDistance(nearby, userPos.latitude, userPos.longitude) : nearby)
  }

  const handlePinPress = (zone: Zone) => {
    setSelectedId(prev => prev === zone.id ? null : zone.id)
  }

  const handleCardPress = (zone: Zone) => {
    setSelectedId(zone.id)
    // react-native-maps throws a native (uncaught) exception on a NaN/null
    // coordinate, which aborts the whole app. Guard with Number.isFinite the
    // same way WebMap does before every animateToRegion call.
    if (Platform.OS !== 'web' &&
        Number.isFinite(zone.center_lat) && Number.isFinite(zone.center_lng)) {
      mapRef.current?.animateToRegion({
        latitude: zone.center_lat,
        longitude: zone.center_lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 400)
    }
    router.push(`/zone/${zone.id}`)
  }

  const handlePreviewEnter = () => {
    if (selectedZone) router.push(`/zone/${selectedZone.id}`)
  }

  const handleDismissPreview = () => setSelectedId(null)

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
        <View style={styles.emptyIcon}>
          <Ionicons name="location-outline" size={32} color="#29B6F6" />
        </View>
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
      <AnimatedBackground />

      <NearbyMap
        zones={filteredZones}
        location={location}
        selectedId={selectedId}
        onPinPress={handlePinPress}
        mapRef={mapRef}
        isVenueOwner={isVenueOwner}
        subscribedIds={subscribedIds}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onMapMove={handleMapMove}
        recenterTick={mapRecenterTick}
        selectedChips={selectedChips}
        onChipsChange={setSelectedChips}
      />

      {loading ? (
        <View style={styles.listLoader}>
          <ActivityIndicator color="#29B6F6" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filteredZones}
          keyExtractor={(z) => z.id}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, index }) => (
            <Reanimated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>
              <ZoneCard
                zone={item}
                selected={selectedId === item.id}
                onPress={() => handleCardPress(item)}
              />
            </Reanimated.View>
          )}
          ListHeaderComponent={
            <View>
              <TrendingStrip zones={zones} onPress={(id) => router.push(`/zone/${id}`)} />
              {filteredZones.length > 0 && (
                <Text style={styles.listLabel}>
                  {searchQuery
                    ? `${filteredZones.length} result${filteredZones.length !== 1 ? 's' : ''} for "${searchQuery}"`
                    : selectedChips.length > 0
                      ? `${filteredZones.length} venue${filteredZones.length !== 1 ? 's' : ''} with ${selectedChips.map(c => `"${c}"`).join(' + ')}`
                      : `${filteredZones.length} venue${filteredZones.length !== 1 ? 's' : ''} nearby`}
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={searchQuery ? 'search-outline' : 'globe-outline'}
                  size={32}
                  color="#29B6F6"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No venues match' : 'No venues nearby yet'}
              </Text>
              <Text style={styles.emptySub}>
                {searchQuery ? 'Try a different search term.' : 'Know a spot? Suggest it and we\'ll invite them.'}
              </Text>
              {!searchQuery && (
                <TouchableOpacity style={styles.suggestBtn} onPress={() => router.push('/venue/submit' as any)}>
                  <Ionicons name="add-circle-outline" size={18} color="#050A15" />
                  <Text style={styles.suggestBtnText}>Suggest a venue</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={
            filteredZones.length > 0 ? (
              <TouchableOpacity style={styles.suggestLink} onPress={() => router.push('/venue/submit' as any)}>
                <Ionicons name="add-circle-outline" size={16} color="#29B6F6" />
                <Text style={styles.suggestLinkText}>Know a spot that's not here? Suggest a venue</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* Google Maps-style bottom preview card */}
      {selectedZone && (
        <Animated.View
          style={[
            styles.previewCard,
            { transform: [{ translateY: cardTranslateY }], opacity: cardOpacity },
            Platform.OS === 'web' ? (styles.previewCardWeb as any) : null,
          ]}
        >
          {/* Drag handle */}
          <View style={preview.handle} />

          {/* Dismiss */}
          <TouchableOpacity style={preview.dismissBtn} onPress={handleDismissPreview} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color="#7A93AC" />
          </TouchableOpacity>

          {/* Badge + info */}
          <View style={preview.row}>
            <View style={[preview.badge, (selectedZone.member_count ?? 0) > 0 && preview.badgeLive]}>
              <Text style={preview.initial}>{selectedZone.name[0]?.toUpperCase()}</Text>
            </View>

            <View style={preview.info}>
              <View style={preview.nameRow}>
                <Text style={preview.name} numberOfLines={1}>{selectedZone.name}</Text>
                {(selectedZone.member_count ?? 0) > 0 && (
                  <View style={preview.livePill}>
                    <Text style={preview.livePillText}>LIVE</Text>
                  </View>
                )}
              </View>

              <View style={preview.metaRow}>
                <TypeLabel type={(selectedZone as any).type} />
                {selectedZone.distance_meters != null && (
                  <Text style={preview.distance}>{formatDistance(selectedZone.distance_meters)}</Text>
                )}
              </View>

              <View style={preview.statsRow}>
                <Text style={preview.stat}>
                  <Text style={[(selectedZone.member_count ?? 0) > 0 ? preview.statNumLive : preview.statNum]}>
                    {selectedZone.member_count ?? 0}
                  </Text>
                  <Text style={preview.statLabel}> here now</Text>
                </Text>
                <Text style={preview.statDot}>·</Text>
                <Text style={preview.stat}>
                  <Text style={preview.statNum}>{selectedZone.post_count ?? 0}</Text>
                  <Text style={preview.statLabel}> posts</Text>
                </Text>
              </View>
            </View>
          </View>

          {/* CTA — disabled with directions link when user is out of range */}
          {(() => {
            const dist = selectedZone.distance_meters
            const radius = selectedZone.radius_meters ?? 10
            // Polygon venues: always show Enter button — user_in_zone() gates precisely at check-in
            const inRange = dist == null || !!selectedZone.polygon_wkt || dist <= radius * 1.3
            if (inRange) {
              return (
                <TouchableOpacity style={preview.enterBtn} onPress={handlePreviewEnter}>
                  <Ionicons name="enter-outline" size={16} color="#050A15" style={{ marginRight: 6 }} />
                  <Text style={preview.enterBtnText}>Enter Venue</Text>
                </TouchableOpacity>
              )
            }
            const mapsUrl = `https://maps.google.com/?q=${selectedZone.center_lat},${selectedZone.center_lng}`
            return (
              <View style={{ gap: 6 }}>
                <View style={[preview.enterBtn, preview.enterBtnDisabled]}>
                  <Ionicons name="location-outline" size={16} color="#7A93AC" style={{ marginRight: 6 }} />
                  <Text style={preview.enterBtnDisabledText}>You're not at this venue yet</Text>
                </View>
                <TouchableOpacity
                  style={preview.directionsBtn}
                  onPress={() => {
                    if (Platform.OS === 'web') window.open(mapsUrl, '_blank')
                    else router.push(mapsUrl as any)
                  }}
                >
                  <Ionicons name="navigate-outline" size={14} color="#29B6F6" style={{ marginRight: 5 }} />
                  <Text style={preview.directionsBtnText}>Get Directions</Text>
                </TouchableOpacity>
              </View>
            )
          })()}
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#050A15' },
  center:     { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center', gap: 12 },
  listLoader: { paddingTop: 24, alignItems: 'center' },
  list: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: TAB_SAFE_BOTTOM + 180, // extra room so last card isn't hidden by preview
    gap: 10,
    ...Platform.select({
      web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
      default: {},
    }),
  },
  listLabel:  { fontSize: 12, color: '#4A6580', fontWeight: '600', paddingBottom: 8, paddingHorizontal: 2 },
  trendingWrap:   { gap: 8, paddingBottom: 14 },
  trendingTitle:  { fontSize: 13, fontWeight: '800', color: '#f8fafc', paddingHorizontal: 2 },
  trendingScroll: { gap: 8, flexDirection: 'row' },
  trendingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#22c55e0D', borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: '#22c55e35',
    maxWidth: 160,
  },
  trendingDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e', flexShrink: 0 },
  trendingName:  { fontSize: 13, fontWeight: '700', color: '#f8fafc', flex: 1 },
  trendingCount: { fontSize: 12, fontWeight: '800', color: '#22c55e', flexShrink: 0 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  suggestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8,
    backgroundColor: '#29B6F6', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11,
  },
  suggestBtnText: { color: '#050A15', fontWeight: '800', fontSize: 14 },
  suggestLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 18,
  },
  suggestLinkText: { color: '#29B6F6', fontWeight: '600', fontSize: 13 },
  emptyIcon:  { width: 64, height: 64, borderRadius: 20, backgroundColor: '#29B6F610', borderWidth: 1, borderColor: '#29B6F620', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 },
  statusText: { color: '#7A93AC', fontSize: 14, marginTop: 8 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  errorSub:   { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 },

  previewCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: TAB_SAFE_BOTTOM,
    backgroundColor: '#0B1828',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderBottomWidth: 0,
    padding: 20,
    paddingTop: 12,
    gap: 14,
    ...Platform.select({
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 20,
      },
    }),
  },
  // Web: centered card with max-width — replaces the full-width sheet look on desktop
  previewCardWeb: {
    maxWidth: 620,
    marginLeft: 'auto',
    marginRight: 'auto',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomWidth: 1,
    bottom: TAB_SAFE_BOTTOM + 12,
    zIndex: 1000,
    boxShadow: '0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(41,182,246,0.08)',
  },
})

const preview = StyleSheet.create({
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#1A2E4A',
    alignSelf: 'center',
    marginBottom: 4,
  },
  dismissBtn: {
    position: 'absolute',
    top: 16, right: 16,
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: '#0D1B2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  row:    { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  badge:  {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#29B6F614', borderWidth: 1.5, borderColor: '#29B6F630',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeLive: { backgroundColor: '#22c55e14', borderColor: '#22c55e40' },
  initial:   { fontSize: 20, fontWeight: '800', color: '#29B6F6' },
  info:      { flex: 1, gap: 5 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:      { fontSize: 17, fontWeight: '800', color: '#f0f8ff', flex: 1, letterSpacing: -0.3 },
  livePill:  {
    backgroundColor: '#22c55e14', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#22c55e40',
  },
  livePillText: { fontSize: 9, fontWeight: '900', color: '#22c55e', letterSpacing: 1.2 },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typePill:  {
    backgroundColor: '#29B6F60C', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#29B6F620',
  },
  typeText:  { fontSize: 11, color: '#29B6F6', fontWeight: '600' },
  distance:  { fontSize: 12, color: '#4A6580', fontWeight: '600' },
  statsRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stat:      { flexDirection: 'row', alignItems: 'baseline' } as any,
  statNum:   { fontSize: 13, fontWeight: '700', color: '#7A93AC' },
  statNumLive: { fontSize: 13, fontWeight: '700', color: '#22c55e' },
  statLabel: { fontSize: 11, color: '#3D5A73' },
  statDot:   { fontSize: 11, color: '#1A2E4A' },
  enterBtn:  {
    backgroundColor: '#29B6F6',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  enterBtnDisabled: { backgroundColor: '#1A2E4A' },
  enterBtnDisabledText: { color: '#7A93AC', fontWeight: '700', fontSize: 14 },
  directionsBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#29B6F630',
    backgroundColor: '#29B6F608',
  },
  directionsBtnText: { color: '#29B6F6', fontWeight: '600', fontSize: 13 },
})
