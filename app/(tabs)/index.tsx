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
    setZones(nearby)
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

  // When searching, show DB results; otherwise show nearby zones
  const filteredZones = searchQuery.trim() ? searchResults : zones

  // Look in both pools so search-result taps populate the preview card
  const selectedZone =
    [...zones, ...searchResults].find(z => z.id === selectedId) ?? null

  // When user pans the map, refetch venues centered on the new position
  const handleMapMove = async (lat: number, lng: number) => {
    if (searchQuery.trim()) return  // don't clobber search results
    const nearby = await fetchNearbyZones(lat, lng, 50)
    setZones(nearby)
  }

  const handlePinPress = (zone: Zone) => {
    setSelectedId(prev => prev === zone.id ? null : zone.id)
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
            filteredZones.length > 0 ? (
              <Text style={styles.listLabel}>
                {searchQuery
                  ? `${filteredZones.length} result${filteredZones.length !== 1 ? 's' : ''} for "${searchQuery}"`
                  : `${filteredZones.length} venue${filteredZones.length !== 1 ? 's' : ''} nearby`}
              </Text>
            ) : null
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
                {searchQuery ? 'Try a different search term.' : 'Be the first to create one.'}
              </Text>
            </View>
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

          {/* CTA */}
          <TouchableOpacity style={preview.enterBtn} onPress={handlePreviewEnter}>
            <Ionicons name="enter-outline" size={16} color="#050A15" style={{ marginRight: 6 }} />
            <Text style={preview.enterBtnText}>Enter Venue</Text>
          </TouchableOpacity>
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
  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
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
})
