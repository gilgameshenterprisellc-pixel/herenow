import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import AvatarImage from '@/components/AvatarImage'
import BackButton from '@/components/BackButton'
import {
  fetchMyCircle, fetchIncomingCircleRequests, respondCircleRequest,
  type CircleMember, type IncomingCircleRequest,
} from '@/lib/circle'

export default function MyCircleScreen() {
  const insets = useSafeAreaInsets()
  const [circle, setCircle]       = useState<CircleMember[]>([])
  const [incoming, setIncoming]   = useState<IncomingCircleRequest[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId]       = useState<string | null>(null)

  const load = useCallback(async () => {
    const [c, inc] = await Promise.all([fetchMyCircle(), fetchIncomingCircleRequests()])
    setCircle(c)
    setIncoming(inc)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const respond = async (req: IncomingCircleRequest, accept: boolean) => {
    setBusyId(req.request_id)
    await respondCircleRequest(req.request_id, accept)
    setBusyId(null)
    setIncoming((prev) => prev.filter((r) => r.request_id !== req.request_id))
    if (accept) load()
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} />
        <View style={styles.headerText}>
          <Text style={styles.title}>My Circle</Text>
          <Text style={styles.sub}>People you've chosen to keep. Private to you.</Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Incoming requests */}
            {incoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Circle Requests</Text>
                {incoming.map((r) => (
                  <View key={r.request_id} style={styles.reqRow}>
                    <AvatarImage uri={r.avatar_url} name={r.display_name} size={44} />
                    <Text style={styles.reqName} numberOfLines={1}>{r.display_name}</Text>
                    <View style={styles.reqActions}>
                      <TouchableOpacity style={styles.declineBtn} onPress={() => respond(r, false)} disabled={busyId === r.request_id}>
                        <Text style={styles.declineText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.acceptBtn} onPress={() => respond(r, true)} disabled={busyId === r.request_id}>
                        {busyId === r.request_id
                          ? <ActivityIndicator color="#050A15" size="small" />
                          : <Text style={styles.acceptText}>Add</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Circle members */}
            {circle.length === 0 && incoming.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="ellipse" size={30} color="#29B6F6" />
                <Text style={styles.emptyTitle}>Your Circle is empty</Text>
                <Text style={styles.emptySub}>
                  When you meet someone worth keeping, send them a Circle request from their profile. It's mutual and private.
                </Text>
              </View>
            ) : (
              <View style={styles.section}>
                {circle.length > 0 && <Text style={styles.sectionLabel}>{circle.length} in your Circle</Text>}
                {circle.map((m) => (
                  <TouchableOpacity key={m.request_id} style={styles.memberRow} onPress={() => router.push(`/u/${m.user_id}` as any)}>
                    <AvatarImage uri={m.avatar_url} name={m.display_name} size={44} />
                    <Text style={styles.memberName} numberOfLines={1}>{m.display_name}</Text>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
  content: { padding: 16, gap: 16 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  reqRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#29B6F630',
  },
  reqName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#f0f8ff' },
  reqActions: { flexDirection: 'row', gap: 8 },
  declineBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: '#3A3A3A' },
  declineText: { color: '#7A93AC', fontWeight: '700', fontSize: 12 },
  acceptBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 9, backgroundColor: '#29B6F6' },
  acceptText: { color: '#050A15', fontWeight: '800', fontSize: 12 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  memberName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#f0f8ff' },
  chevron: { fontSize: 22, color: '#4A6580' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 28, lineHeight: 19 },
})
