import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { publicName } from '@/lib/format'
import {
  fetchVenueThreadMessages, sendVenueMessage, markVenueThreadRead,
} from '@/lib/venueMessages'
import type { DirectMessage } from '@/lib/messages'
import { reportUser, type ReportReason } from '@/lib/reports'
import { blockUser } from '@/lib/blocks'
import { screenText, blockedMessage } from '@/lib/textModeration'
import { platformConfirm } from '@/lib/confirm'
import { useToast } from '@/contexts/ToastContext'
import ActionSheet, { type ActionSheetConfig } from '@/components/ActionSheet'

export default function VenueThreadScreen() {
  const insets = useSafeAreaInsets()
  const { zoneId, u } = useLocalSearchParams<{ zoneId: string; u?: string }>()
  const [userId, setUserId]   = useState<string | null>(null)
  const [otherId, setOtherId] = useState<string | null>(null)
  const [title, setTitle]     = useState('Venue')
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft]     = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sheet, setSheet]     = useState<ActionSheetConfig | null>(null)
  const { showToast }         = useToast()
  const listRef = useRef<FlatList<DirectMessage>>(null)

  const load = useCallback(async (uid: string, other: string) => {
    const msgs = await fetchVenueThreadMessages(zoneId, other)
    setMessages(msgs)
    setLoading(false)
    markVenueThreadRead(zoneId, other)
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50)
  }, [zoneId])

  useEffect(() => {
    let sub: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const user = await getAuthedUser()
      if (!user) { router.replace('/(auth)/login'); return }
      setUserId(user.id)

      const { data: zone } = await supabase
        .from('zones').select('name, owner_id').eq('id', zoneId).maybeSingle()
      if (!zone) { setLoading(false); return }

      const isOwner = zone.owner_id === user.id
      // Patron -> other party is the owner. Owner -> other party is the patron (u param).
      const other = isOwner ? (u ?? null) : zone.owner_id
      if (!other) { setLoading(false); return }
      setOtherId(other)

      if (isOwner) {
        const { data: p } = await supabase.from('profiles').select('display_name').eq('id', other).maybeSingle()
        setTitle(publicName(p?.display_name ?? 'Guest'))
      } else {
        setTitle(zone.name ?? 'Venue')
      }

      await load(user.id, other)

      // Unique per-mount topic — supabase-js dedupes by topic, so reusing
      // `venue-dm:<zone>:<other>` on a remount can throw "cannot add ... after
      // subscribe()". See usePulse. The venue_zone_id filter scopes the data.
      sub = supabase
        .channel(`venue-dm:${zoneId}:${other}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `venue_zone_id=eq.${zoneId}` },
          () => load(user.id, other))
        .subscribe()
    })()
    return () => { if (sub) supabase.removeChannel(sub) }
  }, [zoneId, u, load])

  const send = async () => {
    const content = draft.trim()
    if (!content || !otherId || sending) return
    const screen = screenText(content)
    if (!screen.ok) { showToast(blockedMessage(screen.category), 'error'); return }
    setSending(true)
    setDraft('')
    const msg = await sendVenueMessage({ zoneId, content, recipientId: otherId })
    if (msg) setMessages((prev) => [...prev, msg])
    else { setDraft(content); showToast('Could not send that message. Try again.', 'error') }
    setSending(false)
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
  }

  const leaveThread = () => router.canGoBack() ? router.back() : router.replace('/messages' as any)

  const submitReport = async (reason: ReportReason) => {
    if (!otherId) return
    try {
      await reportUser({ reportedId: otherId, zoneId, reason })
      showToast('Reported. We review reports within 24 hours.', 'success')
    } catch {
      showToast('Could not submit report. Try again.', 'error')
    }
  }

  const handleBlock = () => {
    if (!otherId) return
    platformConfirm(
      `Block ${title}?`,
      'This conversation disappears and neither of you can message the other. You can undo this in Settings > Blocked users.',
      async () => {
        try {
          await blockUser(otherId, { label: title, source: 'venue_dm' })
          showToast('Blocked.', 'success')
          leaveThread()
        } catch {
          showToast('Could not block. Try again.', 'error')
        }
      },
      { confirmText: 'Block', destructive: true }
    )
  }

  const openSafetyMenu = () => {
    setSheet({
      title,
      options: [
        {
          label: 'Report this conversation',
          onPress: () => setSheet({
            title: 'Report this conversation',
            message: 'What is this report about? We review reports within 24 hours and remove content and accounts that break the rules.',
            options: [
              { label: 'Harassment or threats', onPress: () => submitReport('harassment') },
              { label: 'Inappropriate behavior', onPress: () => submitReport('inappropriate_behavior') },
              { label: 'Spam', onPress: () => submitReport('spam') },
              { label: 'Something else', onPress: () => submitReport('other') },
            ],
          }),
        },
        { label: `Block ${title}`, destructive: true, onPress: handleBlock },
      ],
    })
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/messages' as any)} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub}>Venue conversation · no expiry</Text>
        </View>
        {!!otherId && (
          <TouchableOpacity
            onPress={openSafetyMenu}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Report or block"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#7A93AC" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#29B6F6" /></View>
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
                </View>
              </View>
            )
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles" size={22} color="#29B6F6" style={styles.emptyEmoji} />
              <Text style={styles.emptySub}>Say hi — ask a question or send a note. This chat stays open, no time limit.</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor="#4A6580"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}
          onPress={send}
          disabled={!draft.trim() || sending}
        >
          <Text style={styles.sendBtnText}>{sending ? '…' : 'Send'}</Text>
        </TouchableOpacity>
      </View>

      <ActionSheet config={sheet} onClose={() => setSheet(null)} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  sub: { fontSize: 11, color: '#7A93AC', marginTop: 2 },
  list: { padding: 14, gap: 8, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: '#29B6F6', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: '#e8f4fd', lineHeight: 20 },
  bubbleTextMine: { color: '#050A15', fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44 },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#0D1B2E', backgroundColor: '#07101F',
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 44,
    backgroundColor: '#0D1B2E', borderRadius: 22, borderWidth: 1, borderColor: '#1A2E4A',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    color: '#f8fafc', fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#29B6F6', borderRadius: 22, paddingHorizontal: 20, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.4 },
  sendBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15 },
})
