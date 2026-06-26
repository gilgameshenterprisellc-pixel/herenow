import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import type { Zone } from '@/lib/zones'
import WebMap, { WEB_MAP_HEIGHT } from './WebMap'

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
  mapRef?: any
  isVenueOwner?: boolean
}

export const MAP_HEIGHT = WEB_MAP_HEIGHT

export default function NearbyMap({ zones, location, selectedId, onPinPress, isVenueOwner }: Props) {
  return (
    <View style={styles.wrap}>
      {/* Top header bar */}
      <View style={styles.accentLine} />
      <View style={styles.header}>
        <View style={{ gap: 2 }}>
          <Text style={styles.brand}>HERENOW</Text>
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

      {/* Real map */}
      <WebMap
        zones={zones}
        location={location}
        selectedId={selectedId}
        onPinPress={onPinPress}
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
    paddingBottom: 14,
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
  brand: {
    fontSize: 10,
    fontWeight: '800',
    color: '#29B6F6',
    letterSpacing: 3,
    marginBottom: 2,
    ...Platform.select({
      web: { textShadow: '0 0 8px rgba(41,182,246,0.6)' } as any,
      default: {},
    }),
  },
  title: { fontSize: 22, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.5 },
  sub:   { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
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
})
