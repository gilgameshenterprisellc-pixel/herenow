import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import BackButton from '@/components/BackButton'
import {
  fetchPendingSubmissions, approveSubmission, dismissSubmission,
  type VenueSubmission,
} from '@/lib/venueSubmissions'

export default function AdminSubmissionsScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [subs, setSubs]         = useState<VenueSubmission[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId]     = useState<string | null>(null)

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }
    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    if (!profile?.is_admin) { router.replace('/(tabs)'); return }

    setSubs(await fetchPendingSubmissions())
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = (sub: VenueSubmission) => {
    platformConfirm(
      `Approve "${sub.name}"?`,
      'This creates a live venue on the map. You can assign an owner later when they claim it.',
      async () => {
        setBusyId(sub.id)
        const ok = await approveSubmission(sub)
        setBusyId(null)
        if (ok) {
          setSubs((prev) => prev.filter((s) => s.id !== sub.id))
          showToast(`${sub.name} is live. Reach out to claim it.`, 'success')
        } else {
          showToast('Could not approve. Try again.', 'error')
        }
      },
      { confirmText: 'Approve' }
    )
  }

  const handleDismiss = (sub: VenueSubmission) => {
    platformConfirm(
      `Dismiss "${sub.name}"?`,
      'This suggestion will be removed from the queue.',
      async () => {
        setBusyId(sub.id)
        const ok = await dismissSubmission(sub.id)
        setBusyId(null)
        if (ok) setSubs((prev) => prev.filter((s) => s.id !== sub.id))
      },
      { confirmText: 'Dismiss', destructive: true }
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/admin' as any)} />
        <Text style={styles.title}>Venue Suggestions</Text>
        {subs.length > 0 && <Text style={styles.count}>{subs.length} pending</Text>}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" style={{ marginTop: 40 }} />
        ) : subs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="map" size={22} color="#29B6F6" style={styles.emptyEmoji} />
            <Text style={styles.emptyTitle}>No pending suggestions</Text>
            <Text style={styles.emptySub}>When users nominate a venue, it shows up here.</Text>
          </View>
        ) : (
          subs.map((s) => (
            <View key={s.id} style={styles.card}>
              <Text style={styles.name}>{s.name}</Text>
              <View style={styles.metaRow}>
                {s.category ? <Text style={styles.metaChip}>{s.category}</Text> : null}
                {s.latitude != null ? <Text style={styles.metaChip}>📍 GPS pinned</Text> : null}
              </View>
              {s.address ? <Text style={styles.detail}>🏠 {s.address}</Text> : null}
              {s.venue_contact ? <Text style={styles.detail}>✉️ {s.venue_contact}</Text> : null}
              {s.note ? <Text style={styles.note}>"{s.note}"</Text> : null}
              <Text style={styles.submitter}>
                Suggested by {s.submitter?.display_name ?? 'a user'}
              </Text>
              {s.latitude == null && (
                <Text style={styles.needsGps}>⚠️ No GPS location — reach out to the submitter or add coordinates before it can go live.</Text>
              )}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={() => handleDismiss(s)}
                  disabled={busyId === s.id}
                >
                  <Text style={styles.dismissText}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, s.latitude == null && styles.approveBtnDisabled]}
                  onPress={() => handleApprove(s)}
                  disabled={busyId === s.id || s.latitude == null}
                >
                  {busyId === s.id
                    ? <ActivityIndicator color="#050A15" size="small" />
                    : <Text style={styles.approveText}>Approve → Go Live</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ))
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
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc', flex: 1 },
  count: { fontSize: 12, color: '#7A93AC' },
  content: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
  card: {
    backgroundColor: '#0D1B2E', borderRadius: 16, padding: 16, gap: 8,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  name: { fontSize: 17, fontWeight: '800', color: '#f0f8ff' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    fontSize: 11, color: '#29B6F6', fontWeight: '700',
    backgroundColor: '#29B6F615', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  detail: { fontSize: 13, color: '#8EADC7' },
  note: { fontSize: 13, color: '#7A93AC', fontStyle: 'italic' },
  submitter: { fontSize: 11, color: '#4A6580', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  dismissBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#3A3A3A',
  },
  dismissText: { color: '#7A93AC', fontWeight: '700', fontSize: 13 },
  approveBtn: {
    flex: 2, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#22c55e',
  },
  approveText: { color: '#050A15', fontWeight: '800', fontSize: 13 },
  approveBtnDisabled: { opacity: 0.4 },
  needsGps: { fontSize: 12, color: '#f59e0b', lineHeight: 17 },
})
