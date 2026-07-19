import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Platform, Alert, Modal, TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { subscribeAsPatron } from '@/lib/venueSubscriptions'
import {
  fetchBoard, checkBoardAccess, boardCategory, toggleLike, toggleSave,
  reportPin, removePin, markPinComplete, closePinResponses,
  venueHidePin, venuePinToTop, venueBanPinAuthor, respondToPin,
  type BoardPin, type BoardAccess,
} from '@/lib/board'

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

export default function BoardScreen() {
  const insets = useSafeAreaInsets()
  const { zoneId } = useLocalSearchParams<{ zoneId: string }>()
  const { showToast } = useToast()

  const [zoneName, setZoneName]   = useState('')
  const [access, setAccess]       = useState<BoardAccess | null>(null)
  const [isVenueOwner, setIsVenueOwner] = useState(false)
  const [pins, setPins]           = useState<BoardPin[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [menuPinId, setMenuPinId] = useState<string | null>(null)

  // Respond modal state
  const [respondPin, setRespondPin]   = useState<BoardPin | null>(null)
  const [respondText, setRespondText] = useState('')
  const [responding, setResponding]   = useState(false)

  const load = useCallback(async () => {
    if (!zoneId) return
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    if (!user) { router.replace('/(auth)/login'); return }

    const [{ data: zone }, acc] = await Promise.all([
      supabase.from('zones').select('name, owner_id').eq('id', zoneId).maybeSingle(),
      checkBoardAccess(zoneId),
    ])
    setZoneName(zone?.name ?? '')
    setIsVenueOwner(zone?.owner_id === user.id)
    setAccess(acc)
    if (acc === 'ok') setPins(await fetchBoard(zoneId))
    setLoading(false)
    setRefreshing(false)
  }, [zoneId])

  useEffect(() => { load() }, [load])
  // Reload when returning from the composer so a fresh pin shows immediately.
  useFocusEffect(useCallback(() => { if (!loading) load() }, [load]))

  const handleSubscribe = async () => {
    setSubscribing(true)
    const ok = await subscribeAsPatron(zoneId!)
    setSubscribing(false)
    if (!ok) { showToast('Could not subscribe — make sure you\'re checked in.', 'error'); return }
    showToast('Subscribed! Welcome to the Board.', 'success')
    load()
  }

  const handleLike = async (pin: BoardPin) => {
    setPins((prev) => prev.map((p) => p.id === pin.id
      ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p))
    await toggleLike(pin.id, pin.liked)
  }

  const handleSave = async (pin: BoardPin) => {
    setPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, saved: !p.saved } : p))
    await toggleSave(pin.id, pin.saved)
    showToast(pin.saved ? 'Removed from saved.' : 'Saved.', 'success')
  }

  const handleReport = (pin: BoardPin) => {
    platformConfirm(
      'Report this pin?',
      'It will be reviewed. Pins reported by multiple people are hidden automatically.',
      async () => {
        const ok = await reportPin(pin.id)
        showToast(ok ? 'Reported — thank you.' : 'Could not report. Try again.', ok ? 'success' : 'error')
        if (ok) load()
      },
      { confirmText: 'Report', destructive: true },
    )
  }

  const handleRespond = async () => {
    if (!respondPin || !respondText.trim()) return
    setResponding(true)
    const result = await respondToPin(respondPin, respondText.trim())
    setResponding(false)
    if (!result.ok) { showToast(result.reason, 'error'); return }
    setRespondPin(null)
    setRespondText('')
    showToast('Response sent.', 'success')
    router.push(`/messages/response/${result.responseId}` as any)
  }

  // ── Own-pin + venue moderation menus ───────────────────────────────────────
  const runAndReload = async (fn: () => Promise<boolean>, okMsg: string) => {
    setMenuPinId(null)
    const ok = await fn()
    showToast(ok ? okMsg : 'Something went wrong — try again.', ok ? 'success' : 'error')
    if (ok) load()
  }

  const ownPinMenu = (pin: BoardPin) => {
    const respondable = boardCategory(pin.category).respondable
    const options: { label: string; action: () => void; destructive?: boolean }[] = [
      { label: 'Edit', action: () => { setMenuPinId(null); router.push(`/board/new?zoneId=${zoneId}&pinId=${pin.id}` as any) } },
    ]
    if (respondable && pin.status === 'active') {
      options.push({ label: 'Mark Complete / Sold', action: () => runAndReload(() => markPinComplete(pin.id), 'Marked complete.') })
      if (!pin.responses_closed) {
        options.push({ label: 'Close Responses', action: () => runAndReload(() => closePinResponses(pin.id), 'Responses closed.') })
      }
    }
    options.push({ label: 'Remove Pin', destructive: true, action: () => runAndReload(() => removePin(pin.id), 'Pin removed.') })
    return options
  }

  const venueMenu = (pin: BoardPin) => {
    const options: { label: string; action: () => void; destructive?: boolean }[] = [
      { label: pin.is_pinned ? 'Unpin from Top' : 'Pin to Top', action: () => runAndReload(() => venuePinToTop(pin.id, !pin.is_pinned), pin.is_pinned ? 'Unpinned.' : 'Pinned to top.') },
      { label: pin.status === 'hidden' ? 'Unhide' : 'Hide', action: () => runAndReload(() => venueHidePin(pin.id, pin.status !== 'hidden'), pin.status === 'hidden' ? 'Pin restored.' : 'Pin hidden.') },
      { label: 'Remove Pin', destructive: true, action: () => runAndReload(() => removePin(pin.id), 'Pin removed.') },
      { label: 'Ban Poster from Board', destructive: true, action: () => platformConfirm(
        'Ban this poster?',
        'They won\'t be able to pin anything to your Board again. Anonymous posters stay anonymous — the ban still lands.',
        () => runAndReload(() => venueBanPinAuthor(pin.id), 'Poster banned from this Board.'),
        { confirmText: 'Ban', destructive: true },
      ) },
    ]
    return options
  }

  const showPinMenu = (pin: BoardPin) => {
    const options = pin.is_own ? ownPinMenu(pin) : venueMenu(pin)
    if (Platform.OS === 'web') {
      setMenuPinId(menuPinId === pin.id ? null : pin.id)
    } else {
      Alert.alert(pin.title, undefined, [
        ...options.map((o) => ({ text: o.label, style: (o.destructive ? 'destructive' : 'default') as any, onPress: o.action })),
        { text: 'Cancel', style: 'cancel' as any },
      ])
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const gateView = (icon: string, title: string, sub: string, cta?: { label: string; onPress: () => void; busy?: boolean }) => (
    <View style={styles.gate}>
      <Ionicons name={icon as any} size={44} color="#29B6F6" />
      <Text style={styles.gateTitle}>{title}</Text>
      <Text style={styles.gateSub}>{sub}</Text>
      {cta && (
        <TouchableOpacity style={styles.gateBtn} onPress={cta.onPress} disabled={cta.busy} activeOpacity={0.85}>
          {cta.busy ? <ActivityIndicator color="#050A15" /> : <Text style={styles.gateBtnText}>{cta.label}</Text>}
        </TouchableOpacity>
      )}
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace(`/zone/${zoneId}` as any)} />
        <View style={styles.headerText}>
          <Text style={styles.title}>The Board</Text>
          {!!zoneName && <Text style={styles.sub}>📌 {zoneName}</Text>}
        </View>
        {access === 'ok' && !isVenueOwner && (
          <TouchableOpacity style={styles.pinBtn} onPress={() => router.push(`/board/new?zoneId=${zoneId}` as any)} activeOpacity={0.85}>
            <Text style={styles.pinBtnText}>Pin to Board</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : access === 'not_checked_in' ? (
        gateView('location-outline', 'You have to be here',
          'The Board belongs to the people actually at this venue. Check in to see it — just like a real bulletin board.',
          { label: 'Check In', onPress: () => router.push(`/check-in/${zoneId}` as any) })
      ) : access === 'not_subscribed' ? (
        gateView('bookmark-outline', 'Subscribe to see the Board',
          'The Board is for this venue\'s community. Subscribing while you\'re here unlocks it — and the venue\'s full Updates feed.',
          { label: 'Subscribe', onPress: handleSubscribe, busy: subscribing })
      ) : (
        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.content,
            Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
          showsVerticalScrollIndicator={false}
        >
          {pins.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="pin" size={22} color="#29B6F6" style={styles.emptyEmoji} />
              <Text style={styles.emptyTitle}>Nothing on the Board yet</Text>
              <Text style={styles.emptySub}>
                Poetry, missed connections, stuff for sale, gig flyers — pin the first thing and set the tone.
              </Text>
            </View>
          ) : (
            pins.map((pin) => {
              const cat = boardCategory(pin.category)
              return (
                <View key={pin.id} style={[styles.card, pin.status === 'hidden' && styles.cardHidden]}>
                  {/* Category tag + pinned/complete badges */}
                  <View style={styles.cardTop}>
                    <View style={[styles.catTag, { backgroundColor: cat.color + '18', borderColor: cat.color + '55' }]}>
                      <Text style={[styles.catTagText, { color: cat.color }]}>{cat.label}</Text>
                    </View>
                    {pin.is_pinned && (
                      <View style={styles.pinnedTag}><Text style={styles.pinnedTagText}>📌 Pinned</Text></View>
                    )}
                    {pin.status === 'complete' && (
                      <View style={styles.completeTag}><Text style={styles.completeTagText}>✓ {cat.id === 'for_sale' ? 'Sold' : 'Complete'}</Text></View>
                    )}
                    {pin.status === 'hidden' && (
                      <View style={styles.hiddenTag}><Text style={styles.hiddenTagText}>Hidden</Text></View>
                    )}
                    <View style={{ flex: 1 }} />
                    {(pin.is_own || isVenueOwner) && (
                      <View>
                        <TouchableOpacity onPress={() => showPinMenu(pin)} hitSlop={8}>
                          <Text style={styles.moreBtn}>⋯</Text>
                        </TouchableOpacity>
                        {Platform.OS === 'web' && menuPinId === pin.id && (
                          <View style={styles.webMenu}>
                            {(pin.is_own ? ownPinMenu(pin) : venueMenu(pin)).map((o) => (
                              <TouchableOpacity key={o.label} onPress={o.action} style={styles.webMenuItem}>
                                <Text style={[styles.webMenuText, o.destructive && { color: '#f87171' }]}>{o.label}</Text>
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity onPress={() => setMenuPinId(null)} style={styles.webMenuItem}>
                              <Text style={[styles.webMenuText, { color: '#64748b' }]}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  <Text style={styles.cardTitle}>{pin.title}</Text>
                  <Text style={styles.cardBody}>{pin.body}</Text>
                  {!!pin.image_url && (
                    <Image source={{ uri: pin.image_url }} style={styles.cardImage} resizeMode="cover" />
                  )}

                  <View style={styles.byline}>
                    <Text style={styles.bylineText}>
                      Posted by {pin.author_name ?? 'Anonymous'}{pin.is_own ? ' (you)' : ''}
                    </Text>
                    <Text style={styles.bylineTime}>{timeAgo(pin.created_at)}</Text>
                  </View>

                  {/* Actions */}
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleLike(pin)} hitSlop={6}>
                      <Ionicons name={pin.liked ? 'heart' : 'heart-outline'} size={18} color={pin.liked ? '#f43f5e' : '#7A93AC'} />
                      {pin.like_count > 0 && <Text style={styles.actionCount}>{pin.like_count}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleSave(pin)} hitSlop={6}>
                      <Ionicons name={pin.saved ? 'bookmark' : 'bookmark-outline'} size={17} color={pin.saved ? '#29B6F6' : '#7A93AC'} />
                    </TouchableOpacity>
                    {!pin.is_own && (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleReport(pin)} hitSlop={6}>
                        <Ionicons name="flag-outline" size={16} color="#7A93AC" />
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }} />
                    {pin.is_own && pin.response_count > 0 && (
                      <Text style={styles.responseCount}>
                        {pin.response_count} response{pin.response_count === 1 ? '' : 's'}
                      </Text>
                    )}
                    {cat.respondable && !pin.is_own && pin.status === 'active' && !pin.responses_closed && (
                      <TouchableOpacity
                        style={styles.respondBtn}
                        onPress={() => pin.my_response_id
                          ? router.push(`/messages/response/${pin.my_response_id}` as any)
                          : setRespondPin(pin)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.respondBtnText}>{pin.my_response_id ? 'View Response' : 'Respond'}</Text>
                      </TouchableOpacity>
                    )}
                    {cat.respondable && !pin.is_own && pin.responses_closed && pin.status === 'active' && (
                      <Text style={styles.closedText}>Responses closed</Text>
                    )}
                  </View>
                </View>
              )
            })
          )}

          <Text style={styles.footerNote}>
            The Board is only visible to people checked in and subscribed here. Be a good neighbor.
          </Text>
        </ScrollView>
      )}

      {/* Respond modal — first message of a pin-scoped, temporary thread */}
      <Modal visible={!!respondPin} transparent animationType="fade" onRequestClose={() => setRespondPin(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Respond to "{respondPin?.title}"</Text>
            <Text style={styles.modalSub}>
              This starts a temporary conversation about this pin only. It's not a DM and expires when the pin closes or goes quiet.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={respondText}
              onChangeText={setRespondText}
              placeholder="Hey — is this still available?"
              placeholderTextColor="#4A6580"
              multiline
              maxLength={500}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setRespondPin(null); setRespondText('') }} disabled={responding}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSend, (!respondText.trim() || responding) && { opacity: 0.5 }]}
                onPress={handleRespond}
                disabled={!respondText.trim() || responding}
              >
                {responding ? <ActivityIndicator color="#050A15" size="small" /> : <Text style={styles.modalSendText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  sub: { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  pinBtn: {
    backgroundColor: '#29B6F6', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  pinBtnText: { color: '#050A15', fontWeight: '800', fontSize: 13 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 60 },

  // gates
  gate: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32, gap: 10 },
  gateTitle: { fontSize: 19, fontWeight: '800', color: '#f8fafc', marginTop: 6 },
  gateSub: { fontSize: 14, color: '#7A93AC', textAlign: 'center', lineHeight: 21 },
  gateBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12, paddingHorizontal: 28,
    paddingVertical: 13, marginTop: 10, minWidth: 140, alignItems: 'center',
  },
  gateBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15 },

  // empty
  empty: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 19 },

  // pin card
  card: {
    backgroundColor: '#0B1828', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 8,
  },
  cardHidden: { opacity: 0.55, borderStyle: 'dashed' as any },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catTag: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  catTagText: { fontSize: 11, fontWeight: '800' },
  pinnedTag: { backgroundColor: '#C9940C22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  pinnedTagText: { fontSize: 10, fontWeight: '800', color: '#C9940C' },
  completeTag: { backgroundColor: '#22c55e18', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  completeTagText: { fontSize: 10, fontWeight: '800', color: '#22c55e' },
  hiddenTag: { backgroundColor: '#7A93AC22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  hiddenTagText: { fontSize: 10, fontWeight: '800', color: '#7A93AC' },
  moreBtn: { fontSize: 20, color: '#4A6580', paddingHorizontal: 6 },
  webMenu: {
    position: 'absolute', top: 26, right: 0, backgroundColor: '#0D1F35',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(41,182,246,0.15)',
    zIndex: 100, minWidth: 180, overflow: 'hidden',
  },
  webMenuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  webMenuText: { fontSize: 13, color: '#c0d8ec', fontWeight: '500' },

  cardTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  cardBody: { fontSize: 14, color: '#B8D4E8', lineHeight: 20 },
  cardImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#0D1B2E' },
  byline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bylineText: { fontSize: 12, color: '#7A93AC', fontStyle: 'italic' },
  bylineTime: { fontSize: 12, color: '#4A6580' },

  actions: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderTopWidth: 1, borderTopColor: '#12233B', paddingTop: 10, marginTop: 2,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 12, color: '#7A93AC', fontWeight: '600' },
  responseCount: { fontSize: 12, color: '#29B6F6', fontWeight: '700' },
  respondBtn: {
    backgroundColor: '#29B6F618', borderColor: '#29B6F655', borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7,
  },
  respondBtnText: { color: '#29B6F6', fontWeight: '800', fontSize: 13 },
  closedText: { fontSize: 12, color: '#4A6580', fontStyle: 'italic' },

  footerNote: { fontSize: 11, color: '#3A5570', textAlign: 'center', marginTop: 12, lineHeight: 16 },

  // respond modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(5,10,21,0.85)',
    justifyContent: 'center', paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#0D1B2E', borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 10,
    ...Platform.select({ web: { maxWidth: 440, alignSelf: 'center', width: '100%' } as any, default: {} }),
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  modalSub: { fontSize: 12, color: '#7A93AC', lineHeight: 17 },
  modalInput: {
    backgroundColor: '#050A15', borderRadius: 12, borderWidth: 1, borderColor: '#1A2E4A',
    padding: 12, color: '#f8fafc', fontSize: 14, minHeight: 80, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18 },
  modalCancel: { fontSize: 14, color: '#7A93AC', fontWeight: '600' },
  modalSend: {
    backgroundColor: '#29B6F6', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10, minWidth: 70, alignItems: 'center',
  },
  modalSendText: { color: '#050A15', fontWeight: '800', fontSize: 14 },
})
