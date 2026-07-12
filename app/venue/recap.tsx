import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { fetchVenueRecap, type VenueRecap } from '@/lib/venueRecap'

const SOCIAL_LABELS: Record<string, { label: string; color: string }> = {
  dating:     { label: 'Dating',     color: '#f43f5e' },
  friends:    { label: 'Friends',    color: '#22c55e' },
  networking: { label: 'Networking', color: '#3b82f6' },
  just_vibes: { label: 'Just Vibes', color: '#a855f7' },
}

// Local YYYY-MM-DD, offset by `daysAgo`.
function isoDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })
}

function hourLabel(h: number | null): string {
  if (h === null || h === undefined) return '—'
  const am = h < 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${am ? 'am' : 'pm'}`
}

export default function VenueRecapScreen() {
  const insets = useSafeAreaInsets()
  const [zoneId, setZoneId]   = useState<string | null>(null)
  const [daysAgo, setDaysAgo] = useState(1) // default: last night
  const [recap, setRecap]     = useState<VenueRecap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/(auth)/login'); return }
      supabase.from('zones').select('id').eq('owner_id', user.id).limit(1).maybeSingle()
        .then(({ data }) => setZoneId(data?.id ?? null))
    })
  }, [])

  const load = useCallback(async () => {
    if (!zoneId) return
    setLoading(true)
    const r = await fetchVenueRecap(zoneId, isoDate(daysAgo))
    setRecap(r)
    setLoading(false)
  }, [zoneId, daysAgo])

  useEffect(() => { load() }, [load])

  const date = isoDate(daysAgo)
  const modes = recap?.social_modes ?? {}
  const modeTotal = Object.values(modes).reduce((a, b) => a + b, 0)
  const ages = recap?.age_ranges ?? {}
  const ageTotal = Object.values(ages).reduce((a, b) => a + b, 0)
  const interests = Object.entries(recap?.interests ?? {}).sort((a, b) => b[1] - a[1])

  const stat = (label: string, value: string | number) => (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Nightly Recap</Text>
          <Text style={styles.sub}>Your afterglow — the night after</Text>
        </View>
      </View>

      {/* Date nav */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setDaysAgo((d) => d + 1)}>
          <Text style={styles.dateBtnText}>‹ Earlier</Text>
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{prettyDate(date)}</Text>
        <TouchableOpacity
          style={[styles.dateBtn, daysAgo <= 1 && styles.dateBtnDisabled]}
          disabled={daysAgo <= 1}
          onPress={() => setDaysAgo((d) => Math.max(1, d - 1))}
        >
          <Text style={styles.dateBtnText}>Later ›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" style={{ marginTop: 50 }} />
        ) : !recap || recap.total_checkins === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌙</Text>
            <Text style={styles.emptyTitle}>No check-ins that night</Text>
            <Text style={styles.emptySub}>Once people start checking in, your recap shows up here the next day.</Text>
          </View>
        ) : (
          <>
            <View style={styles.statRow}>
              {stat('Check-ins', recap.total_checkins)}
              {stat('Unique guests', recap.unique_visitors)}
            </View>
            <View style={styles.statRow}>
              {stat('New', recap.new_visitors)}
              {stat('Returning', recap.returning)}
            </View>
            <View style={styles.statRow}>
              {stat('Avg. stay', `${recap.avg_dwell_mins}m`)}
              {stat('Peak hour', hourLabel(recap.peak_hour))}
            </View>

            {/* Social mode mix */}
            {modeTotal > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>The Vibe</Text>
                {Object.entries(modes).sort((a, b) => b[1] - a[1]).map(([mode, n]) => {
                  const meta = SOCIAL_LABELS[mode] ?? { label: mode, color: '#7A93AC' }
                  const pct = Math.round((n / modeTotal) * 100)
                  return (
                    <View key={mode} style={styles.barRow}>
                      <Text style={styles.barLabel}>{meta.label}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
                      </View>
                      <Text style={styles.barPct}>{pct}%</Text>
                    </View>
                  )
                })}
              </View>
            )}

            {/* Age ranges */}
            {ageTotal > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Age Ranges</Text>
                {Object.entries(ages).sort((a, b) => b[1] - a[1]).map(([range, n]) => {
                  const pct = Math.round((n / ageTotal) * 100)
                  return (
                    <View key={range} style={styles.barRow}>
                      <Text style={styles.barLabel}>{range}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: '#29B6F6' }]} />
                      </View>
                      <Text style={styles.barPct}>{pct}%</Text>
                    </View>
                  )
                })}
              </View>
            )}

            {/* Top interests */}
            {interests.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Top Interests</Text>
                <View style={styles.interestCloud}>
                  {interests.map(([tag, n]) => (
                    <View key={tag} style={styles.interestPill}>
                      <Text style={styles.interestTag}>{tag}</Text>
                      <View style={styles.interestBadge}><Text style={styles.interestCount}>{n}</Text></View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Came from */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Where they came from</Text>
              {recap.came_from.length > 0 ? (
                recap.came_from.map((v) => (
                  <View key={v.venue} style={styles.flowRow}>
                    <Text style={styles.flowVenue}>{v.venue}</Text>
                    <Text style={styles.flowCount}>{v.count}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.flowEmpty}>No venue-to-venue movement tracked that night.</Text>
              )}
            </View>

            {/* Went to */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Where they went next</Text>
              {recap.went_to.length > 0 ? (
                recap.went_to.map((v) => (
                  <View key={v.venue} style={styles.flowRow}>
                    <Text style={styles.flowVenue}>{v.venue}</Text>
                    <Text style={styles.flowCount}>{v.count}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.flowEmpty}>No venue-to-venue movement tracked that night.</Text>
              )}
            </View>

            <Text style={styles.footNote}>
              Everything here is aggregate and anonymous. Cross-venue movement shows venue names and counts only, never who moved.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  sub: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  dateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0D1B2E' },
  dateBtnDisabled: { opacity: 0.35 },
  dateBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 13 },
  dateLabel: { color: '#f0f8ff', fontWeight: '800', fontSize: 15 },
  content: { padding: 16, gap: 12 },
  statRow: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1, backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#1A2E4A', alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 26, fontWeight: '900', color: '#29B6F6' },
  statLabel: { fontSize: 12, color: '#8EADC7', fontWeight: '600' },
  card: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16, gap: 10,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  cardLabel: { fontSize: 12, fontWeight: '800', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { width: 80, fontSize: 13, color: '#D0E8F5' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#07101F', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barPct: { width: 38, textAlign: 'right', fontSize: 12, color: '#7A93AC', fontWeight: '700' },
  flowRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  flowVenue: { fontSize: 15, color: '#f0f8ff', fontWeight: '600' },
  flowCount: { fontSize: 15, color: '#29B6F6', fontWeight: '800' },
  flowEmpty: { fontSize: 13, color: '#7A93AC', lineHeight: 18 },
  footNote: { fontSize: 11, color: '#4A6580', lineHeight: 16, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 28, lineHeight: 19 },
  interestCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0A1628', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  interestTag: { fontSize: 13, color: '#8EADC7', fontWeight: '600' },
  interestBadge: {
    backgroundColor: '#29B6F620', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  interestCount: { fontSize: 11, color: '#29B6F6', fontWeight: '800' },
})
