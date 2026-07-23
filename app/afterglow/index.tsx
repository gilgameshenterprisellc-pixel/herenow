import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from '@/components/BackButton'
import { getAfterglowHistory } from '@/lib/sessions'

interface Afterglow {
  id: string
  session_id: string
  zone_name: string
  zone_id: string
  people_count: number
  we_met_count: number
  duration_mins: number
  highlights: string[]
  created_at: string
}

interface Night {
  key: string
  label: string
  glows: Afterglow[]
  totalMins: number
  totalWeMet: number
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// Group check-outs into "a night out". A night runs until 6am Nashville
// (America/Chicago) — the same boundary the venue Pulse recap uses — so an 8pm
// check-in and a 1am one land in the same night. Venues are Nashville for now;
// per-venue timezones come with multi-city.
function nightBucket(iso: string): { key: string; label: string } {
  const d = new Date(iso)
  // Wall-clock time in Nashville, held in a runtime-local Date so the date parts
  // below read the Nashville values. Shift back 6h so pre-6am counts as the
  // night before.
  const nash = new Date(d.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  nash.setHours(nash.getHours() - 6)
  const key = `${nash.getFullYear()}-${nash.getMonth()}-${nash.getDate()}`
  const label = nash.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  return { key, label }
}

function groupNights(glows: Afterglow[]): Night[] {
  const map = new Map<string, Night>()
  for (const g of glows) {
    const { key, label } = nightBucket(g.created_at)
    let night = map.get(key)
    if (!night) {
      night = { key, label, glows: [], totalMins: 0, totalWeMet: 0 }
      map.set(key, night)
    }
    night.glows.push(g)
    night.totalMins += g.duration_mins ?? 0
    night.totalWeMet += g.we_met_count ?? 0
  }
  // getAfterglowHistory returns newest-first, so insertion order is already
  // newest night -> oldest.
  return Array.from(map.values())
}

export default function AfterglowLibraryScreen() {
  const insets = useSafeAreaInsets()
  const [nights, setNights] = useState<Night[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAfterglowHistory()
      .then((rows) => setNights(groupNights(rows as Afterglow[])))
      .catch(() => setNights([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <Text style={styles.topTitle}>Your Nights</Text>
        <View style={styles.topSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#29B6F6" size="large" />
        </View>
      ) : nights.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="moon-outline" size={40} color="#29B6F6" />
          <Text style={styles.emptyTitle}>No nights yet</Text>
          <Text style={styles.emptySub}>
            Your afterglows show up here after you check out of a venue. Every night out, saved.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {nights.map((night) => (
            <View key={night.key} style={styles.nightCard}>
              <View style={styles.nightHeader}>
                <Text style={styles.nightLabel}>{night.label}</Text>
                <Text style={styles.nightSummary}>
                  {night.glows.length} {night.glows.length === 1 ? 'venue' : 'venues'}
                  {'  ·  '}{formatDuration(night.totalMins)}
                  {night.totalWeMet > 0 ? `  ·  ${night.totalWeMet} We Met` : ''}
                </Text>
              </View>

              {night.glows.map((g) => {
                const connected = (g.we_met_count ?? 0) > 0
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={styles.venueRow}
                    onPress={() => router.push(`/afterglow/${g.session_id}` as any)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={connected ? 'sparkles' : 'moon'}
                      size={17}
                      color={connected ? '#29B6F6' : '#5B7A99'}
                    />
                    <View style={styles.venueMeta}>
                      <Text style={styles.venueName} numberOfLines={1}>{g.zone_name}</Text>
                      <Text style={styles.venueStats}>
                        {formatDuration(g.duration_mins)}
                        {(g.people_count ?? 0) > 1 ? `  ·  ${g.people_count} present` : ''}
                        {connected ? `  ·  ${g.we_met_count} We Met` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#3A5578" />
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  topSpacer: { width: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 19, maxWidth: 300 },
  content: { padding: 16, gap: 16 },
  nightCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    overflow: 'hidden',
  },
  nightHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#12233A',
  },
  nightLabel: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  nightSummary: { fontSize: 12, color: '#7A93AC' },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  venueMeta: { flex: 1, gap: 2 },
  venueName: { fontSize: 14, fontWeight: '700', color: '#DCEBF7' },
  venueStats: { fontSize: 12, color: '#7A93AC' },
})
