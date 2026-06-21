import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface Afterglow {
  id: string
  zone_name: string
  zone_id: string
  people_count: number
  we_met_count: number
  duration_mins: number
  highlights: string[]
  created_at: string
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function AftergowScreen() {
  const { sessionId }  = useLocalSearchParams<{ sessionId: string }>()
  const [glow, setGlow] = useState<Afterglow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('afterglow')
      .select('*')
      .eq('session_id', sessionId)
      .single()
      .then(({ data }) => {
        setGlow(data)
        setLoading(false)
      })
  }, [sessionId])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" size="large" />
      </View>
    )
  }

  if (!glow) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Session recap not found.</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.homeBtn}>
          <Text style={styles.homeBtnText}>Go home</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const hadConnections = glow.we_met_count > 0
  const hadPeople      = glow.people_count > 1
  const highlights     = glow.highlights ?? []

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Glow header */}
        <View style={styles.glowHeader}>
          <Text style={styles.glowEmoji}>
            {hadConnections ? '✨' : hadPeople ? '🌙' : '🪐'}
          </Text>
          <Text style={styles.glowTitle}>Afterglow</Text>
          <Text style={styles.zoneName}>{glow.zone_name}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{formatDuration(glow.duration_mins)}</Text>
            <Text style={styles.statLabel}>Time there</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{glow.people_count}</Text>
            <Text style={styles.statLabel}>People present</Text>
          </View>
          <View style={[styles.statCard, hadConnections && styles.statCardHighlight]}>
            <Text style={[styles.statNum, hadConnections && styles.statNumHighlight]}>
              {glow.we_met_count}
            </Text>
            <Text style={[styles.statLabel, hadConnections && styles.statLabelHighlight]}>
              We Met
            </Text>
          </View>
        </View>

        {/* Highlights */}
        {highlights.length > 0 && (
          <View style={styles.highlightsCard}>
            {highlights.map((h, i) => (
              <View key={i} style={styles.highlightRow}>
                <Text style={styles.highlightDot}>•</Text>
                <Text style={styles.highlightText}>{h}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Reflection */}
        <View style={styles.reflectionCard}>
          <Text style={styles.reflectionTitle}>
            {hadConnections
              ? "You made a real connection tonight."
              : hadPeople
              ? "You were part of the energy."
              : "You held the space."}
          </Text>
          <Text style={styles.reflectionBody}>
            {hadConnections
              ? `${glow.we_met_count === 1 ? 'One person' : `${glow.we_met_count} people`} confirmed they actually met you tonight. ` +
                `Check your messages — DMs are now unlocked for 72 hours.`
              : hadPeople
              ? `You spent ${formatDuration(glow.duration_mins)} in a space with ${glow.people_count} other ${glow.people_count === 1 ? 'person' : 'people'}. ` +
                `No pressure. Some nights are just for the vibe.`
              : `You were here. That counts.`}
          </Text>
        </View>

        {/* CTA row */}
        {hadConnections && (
          <TouchableOpacity
            style={styles.dmBtn}
            onPress={() => router.push('/messages')}
          >
            <Text style={styles.dmBtnText}>💌 Go to Messages</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.homeBtnText}>Back to Map</Text>
        </TouchableOpacity>

        {/* Privacy reminder */}
        <Text style={styles.privacy}>
          🔒 Pulse posts and venue chat from this session have already expired.
          Your presence is no longer visible at this venue.
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center', gap: 16 },
  content: { padding: 24, alignItems: 'center', gap: 20, paddingBottom: 60 },
  glowHeader: { alignItems: 'center', gap: 8, paddingTop: 40 },
  glowEmoji: { fontSize: 56 },
  glowTitle: { fontSize: 28, fontWeight: '900', color: '#29B6F6', letterSpacing: -0.5 },
  zoneName: { fontSize: 15, color: '#8EADC7' },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 4,
  },
  statCardHighlight: { borderColor: '#29B6F644', backgroundColor: '#29B6F608' },
  statNum: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  statNumHighlight: { color: '#29B6F6' },
  statLabel: { fontSize: 11, color: '#7A93AC', textAlign: 'center' },
  statLabelHighlight: { color: '#92400e' },
  highlightsCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  highlightRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  highlightDot: { color: '#29B6F6', fontSize: 14, lineHeight: 20 },
  highlightText: { fontSize: 13, color: '#B8D4E8', lineHeight: 20, flex: 1 },
  reflectionCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    padding: 20,
    gap: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  reflectionTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  reflectionBody: { fontSize: 14, color: '#8EADC7', lineHeight: 20 },
  dmBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  dmBtnText: { color: '#050A15', fontWeight: '800', fontSize: 16 },
  homeBtn: {
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  homeBtnText: { color: '#8EADC7', fontWeight: '700', fontSize: 15 },
  privacy: { fontSize: 12, color: '#4A6580', textAlign: 'center', lineHeight: 17, paddingHorizontal: 10 },
  errorText: { color: '#8EADC7', fontSize: 15 },
})
