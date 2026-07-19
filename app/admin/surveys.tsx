import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, TouchableOpacity, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import BackButton from '@/components/BackButton'
import {
  fetchSurveySubmissions, SURVEY_QUESTIONS, questionById,
  type SurveySubmission,
} from '@/lib/survey'

export default function AdminSurveys() {
  const insets = useSafeAreaInsets()
  const [rows, setRows]         = useState<SurveySubmission[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchSurveySubmissions()
    setRows(data)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const total = rows.length
  const ratings = rows.map((r) => r.answers.q1).filter((v): v is number => typeof v === 'number')
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  const scores = rows.map((r) => r.answers.q2).filter((v): v is number => typeof v === 'number')
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  // NPS: promoters (9-10) minus detractors (0-6), as a percentage.
  const nps = scores.length
    ? Math.round(
        ((scores.filter((s) => s >= 9).length - scores.filter((s) => s <= 6).length) / scores.length) * 100,
      )
    : null

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/admin' as any)} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Surveys & Feedback</Text>
          <Text style={styles.headerSub}>Anonymous responses from the app</Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 720, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
        ) : total === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-open" size={22} color="#29B6F6" style={styles.emptyEmoji} />
            <Text style={styles.emptyText}>No survey responses yet.</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <Stat label="Responses" value={String(total)} />
              <Stat label="Avg rating" value={avgRating != null ? `${avgRating.toFixed(1)}★` : '—'} />
              <Stat label="Avg likelihood" value={avgScore != null ? `${avgScore.toFixed(1)}/10` : '—'} />
              <Stat label="NPS" value={nps != null ? String(nps) : '—'} />
            </View>

            {rows.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardDate}>{fmtDate(r.submitted_at)}</Text>
                  {r.app_version && <Text style={styles.cardVersion}>v{r.app_version}</Text>}
                </View>
                {SURVEY_QUESTIONS.map((q) => {
                  const a = r.answers[q.id]
                  if (a === undefined || a === '') return null
                  return (
                    <View key={q.id} style={styles.qaRow}>
                      <Text style={styles.qaPrompt}>{questionById(q.id)?.prompt}</Text>
                      <Text style={styles.qaAnswer}>
                        {q.type === 'stars' ? `${a} / 5 ★`
                          : q.type === 'scale' ? `${a} / 10`
                          : String(a)}
                      </Text>
                    </View>
                  )
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
  headerSub: { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1, minWidth: 80, backgroundColor: '#0D1B2E', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#1A2E4A', alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: '#29B6F6' },
  statLabel: { fontSize: 11, color: '#7A93AC', textAlign: 'center' },
  card: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 12, marginTop: 4,
  },
  cardHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#1A2E4A', paddingBottom: 8,
  },
  cardDate: { fontSize: 13, fontWeight: '700', color: '#8EADC7' },
  cardVersion: { fontSize: 11, color: '#4A6580' },
  qaRow: { gap: 3 },
  qaPrompt: { fontSize: 12, color: '#7A93AC', lineHeight: 16 },
  qaAnswer: { fontSize: 14, color: '#f8fafc', fontWeight: '600', lineHeight: 19 },
  empty: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, color: '#7A93AC' },
})
