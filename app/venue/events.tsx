import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { fetchAllVenueEvents, deleteEvent, type VenueEvent } from '@/lib/events'

const TYPE_EMOJI: Record<string, string> = {
  music: '🎵', trivia: '🧠', happy_hour: '🍺', sports: '🏀',
  comedy: '😂', karaoke: '🎤', general: '📅',
}

export default function ManageEventsScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [zoneId, setZoneId]   = useState<string | null>(null)
  const [events, setEvents]   = useState<VenueEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: zones } = await supabase
      .from('zones')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)

    const zid = zones?.[0]?.id ?? null
    setZoneId(zid)
    if (zid) setEvents(await fetchAllVenueEvents(zid))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const confirmDelete = (ev: VenueEvent) => {
    platformConfirm(
      'Delete event?',
      `"${ev.title}" will be removed. This can't be undone.`,
      async () => {
        setDeletingId(ev.id)
        const ok = await deleteEvent(ev.id)
        setDeletingId(null)
        if (!ok) { showToast('Could not delete — try again.', 'error'); return }
        setEvents((prev) => prev.filter((e) => e.id !== ev.id))
        showToast('Event deleted.', 'success')
      },
      { confirmText: 'Delete', destructive: true },
    )
  }

  const fmtRange = (ev: VenueEvent) => {
    const s = new Date(ev.starts_at)
    const startStr = s.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    if (!ev.ends_at) return startStr
    const e = new Date(ev.ends_at)
    const sameDay = s.toDateString() === e.toDateString()
    const endStr = e.toLocaleString([], sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    return `${startStr} – ${endStr}`
  }

  const isPast = (ev: VenueEvent) => new Date(ev.ends_at ?? ev.starts_at).getTime() < Date.now()

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Manage Events</Text>
          <Text style={styles.sub}>See, edit, and delete the events you've posted</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
        showsVerticalScrollIndicator={false}
      >
        {zoneId && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push(`/zone/event/create?zoneId=${zoneId}` as any)}
          >
            <Text style={styles.addBtnText}>＋ Add Event</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
        ) : events.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyText}>No events yet.</Text>
            <Text style={styles.emptySub}>Events you create show up here where you can remove them.</Text>
          </View>
        ) : (
          events.map((ev) => (
            <View key={ev.id} style={[styles.card, isPast(ev) && styles.cardPast]}>
              <Text style={styles.cardEmoji}>{TYPE_EMOJI[ev.event_type] ?? '📅'}</Text>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{ev.title}</Text>
                  {isPast(ev) && <Text style={styles.pastPill}>Past</Text>}
                </View>
                <Text style={styles.cardWhen}>{fmtRange(ev)}</Text>
                <Text style={styles.cardMeta}>{ev.rsvp_count} RSVP{ev.rsvp_count === 1 ? '' : 's'}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => router.push(`/zone/event/create?zoneId=${ev.zone_id}&eventId=${ev.id}` as any)}
                  hitSlop={8}
                >
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(ev)}
                  disabled={deletingId === ev.id}
                  hitSlop={8}
                >
                  {deletingId === ev.id
                    ? <ActivityIndicator color="#ef4444" size="small" />
                    : <Text style={styles.deleteBtnText}>Delete</Text>}
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
    paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  sub: { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  addBtn: {
    borderWidth: 1, borderColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginBottom: 4,
  },
  addBtnText: { color: '#29B6F6', fontWeight: '800', fontSize: 15 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  cardPast: { opacity: 0.6 },
  cardEmoji: { fontSize: 26 },
  cardBody: { flex: 1, gap: 3 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  pastPill: {
    fontSize: 10, fontWeight: '800', color: '#7A93AC',
    backgroundColor: '#1A2E4A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    overflow: 'hidden',
  },
  cardWhen: { fontSize: 13, color: '#29B6F6', fontWeight: '600' },
  cardMeta: { fontSize: 12, color: '#7A93AC' },
  cardActions: { gap: 6 },
  editBtn: {
    borderWidth: 1, borderColor: '#29B6F655', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#29B6F612',
    minWidth: 66, alignItems: 'center',
  },
  editBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 13 },
  deleteBtn: {
    borderWidth: 1, borderColor: '#ef444455', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#ef444412',
    minWidth: 66, alignItems: 'center',
  },
  deleteBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', marginTop: 70, gap: 8, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
})
