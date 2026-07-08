import { useState } from 'react'
import { View, Text, Image, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import type { Zone } from '@/lib/zones'
import WebMap, { WEB_MAP_HEIGHT } from './WebMap'

const FILTER_CHIPS = [
  'Cocktails', 'Draft Beer', 'Wine Bar', 'Full Menu', 'Late Night Bites',
  'Live Music', 'DJ', 'Karaoke', 'Trivia Night', 'Sports TV',
  'Billiards', 'Patio', 'Dance Floor', 'Rooftop',
  'Happy Hour', '21+', 'Dog Friendly', 'Reservations',
]

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
  mapRef?: any
  isVenueOwner?: boolean
  subscribedIds: Set<string>
  searchQuery: string
  onSearchChange: (q: string) => void
  onMapMove?: (lat: number, lng: number) => void
  recenterTick?: number
  selectedChips: string[]
  onChipsChange: (chips: string[]) => void
}

export const MAP_HEIGHT = WEB_MAP_HEIGHT

export default function NearbyMap({
  zones, location, selectedId, onPinPress,
  isVenueOwner, subscribedIds, searchQuery, onSearchChange, onMapMove, recenterTick,
  selectedChips, onChipsChange,
}: Props) {
  const [searchFocused, setSearchFocused] = useState(false)
  const insets = useSafeAreaInsets()

  const liveCount       = zones.filter(z => (z.member_count ?? 0) > 0).length
  const subscribedCount = zones.filter(z => subscribedIds.has(z.id)).length

  return (
    <View style={styles.wrap}>
      <View style={styles.accentLine} />

      {/* Header row */}
      <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top + 8 : 14 }]}>
        <View style={{ gap: 2 }}>
          <Image source={require('@/assets/logo-wordmark.png')} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.title}>Nearby</Text>
          <Text style={styles.sub}>
            {location
              ? `${zones.length} venue${zones.length !== 1 ? 's' : ''} within 50km`
              : 'Waiting for location…'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {location && (
            <View style={styles.locRow}>
              <View style={styles.dot} />
              <Text style={styles.locNote}>Live</Text>
            </View>
          )}
          {isVenueOwner && (
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/zone/create')}>
              <Text style={styles.addBtnText}>+ Venue</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search venues…"
            placeholderTextColor="#4A6580"
            value={searchQuery}
            onChangeText={onSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Chip filter — multi-select: tap to add, tap again to remove */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipStrip}
        >
          {selectedChips.length > 0 && (
            <TouchableOpacity
              style={styles.chipClear}
              onPress={() => onChipsChange([])}
              activeOpacity={0.75}
            >
              <Text style={styles.chipClearText}>✕ Clear</Text>
            </TouchableOpacity>
          )}
          {FILTER_CHIPS.map((chip) => {
            const active = selectedChips.includes(chip)
            return (
              <TouchableOpacity
                key={chip}
                style={[styles.chipPill, active && styles.chipPillActive]}
                onPress={() =>
                  active
                    ? onChipsChange(selectedChips.filter((c) => c !== chip))
                    : onChipsChange([...selectedChips, chip])
                }
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {chip}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Tier legend */}
        <View style={styles.legend}>
          {subscribedCount > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.legendLabel}>Subscribed</Text>
            </View>
          )}
          {liveCount > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.legendLabel}>Live</Text>
            </View>
          )}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#29B6F6' }]} />
            <Text style={styles.legendLabel}>Nearby</Text>
          </View>
        </View>
      </View>

      {/* Map */}
      <WebMap
        zones={zones}
        location={location}
        selectedId={selectedId}
        onPinPress={onPinPress}
        subscribedIds={subscribedIds}
        onMapMove={onMapMove}
        recenterTick={recenterTick}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#060D1A',
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  accentLine: {
    height: 2,
    backgroundColor: '#29B6F6',
    ...Platform.select({
      web: { boxShadow: '0 0 12px rgba(41,182,246,0.8), 0 0 24px rgba(41,182,246,0.4)' } as any,
      default: {},
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
    ...Platform.select({
      web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
      default: {},
    }),
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: { width: 96, height: 17, marginBottom: 2 },
  title:   { fontSize: 22, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.5 },
  sub:     { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  locRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  locNote: { fontSize: 11, color: '#22c55e', fontWeight: '700' },
  addBtn: {
    backgroundColor: '#29B6F610',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#29B6F640',
  },
  addBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 13 },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    ...Platform.select({
      web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
      default: {},
    }),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchBarFocused: {
    borderColor: '#29B6F6',
    ...Platform.select({
      web: { boxShadow: '0 0 0 2px rgba(41,182,246,0.18)' } as any,
      default: {},
    }),
  },
  searchIcon:  { fontSize: 17, color: '#4A6580' },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
      default: {},
    }),
  },
  clearBtn:     { padding: 4 },
  clearBtnText: { color: '#4A6580', fontSize: 13, fontWeight: '600' },

  // Chip filter
  chipStrip: { gap: 7, flexDirection: 'row', paddingBottom: 2 },
  chipPill: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  chipPillActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  chipText: { fontSize: 12, color: '#7A93AC', fontWeight: '600' },
  chipTextActive: { color: '#29B6F6', fontWeight: '700' },
  chipClear: {
    backgroundColor: '#ef444418',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#ef444440',
  },
  chipClearText: { fontSize: 12, color: '#ef4444', fontWeight: '700' },

  // Legend
  legend:     { flexDirection: 'row', gap: 14, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: '#7A93AC', fontWeight: '500' },
})
