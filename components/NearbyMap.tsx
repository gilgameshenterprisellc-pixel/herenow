import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import type { Zone } from '@/lib/zones'

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
  mapRef?: any
  isVenueOwner?: boolean
}

export const MAP_HEIGHT = 120

export default function NearbyMap({ zones, location, isVenueOwner }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <View style={styles.row}>
          <View>
            <Text style={styles.title}>Nearby</Text>
            <Text style={styles.sub}>
              {location
                ? `${zones.length} venue${zones.length !== 1 ? 's' : ''} within 50km`
                : 'Waiting for location…'}
            </Text>
          </View>
          {isVenueOwner && (
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/zone/create')}>
              <Text style={styles.addBtnText}>+ Venue</Text>
            </TouchableOpacity>
          )}
        </View>

        {location && (
          <View style={styles.locRow}>
            <View style={styles.dot} />
            <Text style={styles.locText}>
              {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </Text>
            <Text style={styles.locNote}>  Live location active</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#0D1B2E',
    borderBottomWidth: 1,
    borderBottomColor: '#1A2E4A',
  },
  inner: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
    ...Platform.select({
      web: { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as any } as any,
      default: {},
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#f8fafc' },
  sub:   { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  addBtn: {
    backgroundColor: '#050A15',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#29B6F644',
  },
  addBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 13 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  locText: { fontSize: 11, color: '#4A6580', fontFamily: 'monospace' },
  locNote: { fontSize: 11, color: '#22c55e', fontWeight: '600' },
})
