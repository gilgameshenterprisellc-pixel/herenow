import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import {
  fetchMyResponseThreads, fetchResponseMessages, sendResponseMessage,
  closeResponseThread, responseExpired, boardCategory,
  fetchContactExchange, shareContact,
  type ResponseThread, type ResponseMessage, type ContactExchangeState,
} from '@/lib/board'

// A Response thread: a temporary conversation tied to ONE Board pin. Not a DM —
// it expires with the pin (or inactivity) and never creates a connection.
export default function ResponseThreadScreen() {
  const insets = useSafeAreaInsets()
  const { responseId } = useLocalSearchParams<{ responseId: string }>()
  const { showToast } = useToast()

  const [userId, setUserId]     = useState<string | null>(null)
  const [thread, setThread]     = useState<ResponseThread | null>(null)
  const [messages, setMessages] = useState<ResponseMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [notFound, setNotFound] = useState(false)

  // Contact exchange
  const [contact, setContact]           = useState<ContactExchangeState>({ myContact: null, otherContact: null, otherHasShared: false })
  const [shareOpen, setShareOpen]       = useState(false)
  const [shareValue, setShareValue]     = useState('')
  const [sharing, setSharing]           = useState(false)

  const listRef = useRef<FlatList>(null)

  const load = useCallback(async () => {
    if (!responseId) return
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    if (!user) { router.replace('/(auth)/login'); return }
    setUserId(user.id)

    const threads = await fetchMyResponseThreads()
    const t = threads.find((x) => x.response_id === responseId) ?? null
    if (!t) { setNotFound(true); setLoading(false); return }
    setThread(t)

    const [msgs, cx] = await Promise.all([
      fetchResponseMessages(responseId),
      fetchContactExchange(responseId),
    ])
    setMessages(msgs)
    setContact(cx)
    setLoading(false)
  }, [responseId])

  useEffect(() => {
    load()
    // Light polling keeps the thread fresh without Realtime plumbing.
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [load])

  const locked = thread ? (responseExpired(thread) || thread.pin_status !== 'active') : false

  const handleSend = async () => {
    if (!input.trim() || !thread || sending) return
    setSending(true)
    const ok = await sendResponseMessage(thread.response_id, input.trim(), { pinTitle: thread.pin_title })
    setSending(false)
    if (!ok) { showToast('Could not send. Try again.', 'error'); return }
    setInput('')
    load()
  }

  const handleShareContact = async () => {
    if (!shareValue.trim()) return
    setSharing(true)
    const ok = await shareContact(responseId!, shareValue.trim())
    setSharing(false)
    if (!ok) { showToast('Could not share contact. Try again.', 'error'); return }
    setShareOpen(false)
    showToast('Shared. It reveals only when both of you have shared.', 'success')
    load()
  }

  const handleCloseThread = () => {
    platformConfirm(
      'Close this conversation?',
      'It disappears for both of you. This can\'t be undone.',
      async () => {
        const ok = await closeResponseThread(responseId!)
        if (!ok) { showToast('Could not close. Try again.', 'error'); return }
        router.back()
      },
      { confirmText: 'Close', destructive: true },
    )
  }

  const otherName = thread?.other_name ?? 'Anonymous'
  const cat = thread ? boardCategory(thread.pin_category) : null

  if (notFound) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>Response</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.expiredTitle}>This conversation is gone</Text>
          <Text style={styles.expiredSub}>The pin was removed, or the thread expired. That's the Board — nothing lasts forever.</Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{otherName}</Text>
          {thread && (
            <Text style={styles.sub} numberOfLines={1}>
              {cat?.label} · "{thread.pin_title}" · {thread.zone_name}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleCloseThread} hitSlop={8}>
          <Ionicons name="trash-outline" size={19} color="#7A93AC" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Context strip — this thread exists ONLY for this pin */}
          <View style={styles.contextStrip}>
            <Text style={styles.contextText}>
              Temporary conversation about this pin. It expires when the pin closes or goes quiet — no connection is created.
            </Text>
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              styles.list,
              Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
            ]}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.sender_id === userId
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && { color: '#050A15' }]}>{item.content}</Text>
                </View>
              )
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Say something about the pin to get things going.</Text>
            }
          />

          {/* Contact exchange state */}
          <View style={styles.contactRow}>
            {contact.otherContact ? (
              <View style={styles.contactRevealed}>
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={styles.contactRevealedText}>
                  {otherName}: <Text style={{ fontWeight: '800' }}>{contact.otherContact}</Text>
                </Text>
              </View>
            ) : contact.myContact ? (
              <Text style={styles.contactPending}>
                Contact shared — reveals when {otherName} shares theirs too.
              </Text>
            ) : (
              <TouchableOpacity style={styles.contactBtn} onPress={() => setShareOpen(true)} activeOpacity={0.85}>
                <Ionicons name="swap-horizontal" size={15} color="#29B6F6" />
                <Text style={styles.contactBtnText}>
                  {contact.otherHasShared ? 'Accept Contact Exchange' : 'Share Contact'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Composer / locked banner */}
          {locked ? (
            <View style={[styles.lockedBanner, { paddingBottom: insets.bottom + 14 }]}>
              <Text style={styles.lockedText}>
                {thread?.pin_status === 'complete'
                  ? 'This pin was marked complete — the conversation is closed.'
                  : thread?.pin_status !== 'active'
                    ? 'This pin is no longer on the Board — the conversation is closed.'
                    : 'This conversation went quiet and expired.'}
              </Text>
            </View>
          ) : (
            <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Message about this pin…"
                placeholderTextColor="#4A6580"
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
                onPress={handleSend}
                disabled={!input.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator color="#050A15" size="small" />
                  : <Ionicons name="arrow-up" size={18} color="#050A15" />}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Share-contact modal — mutual consent, nothing reveals one-sided */}
      <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Share contact info</Text>
            <Text style={styles.modalSub}>
              Phone, email, @handle — whatever you want them to have. It's revealed ONLY when both of you share. Never post contact info on the Board itself.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={shareValue}
              onChangeText={setShareValue}
              placeholder="e.g. 615-555-0100 or @yourhandle"
              placeholderTextColor="#4A6580"
              maxLength={120}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShareOpen(false)} disabled={sharing}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSend, (!shareValue.trim() || sharing) && { opacity: 0.5 }]}
                onPress={handleShareContact}
                disabled={!shareValue.trim() || sharing}
              >
                {sharing ? <ActivityIndicator color="#050A15" size="small" /> : <Text style={styles.modalSendText}>Share</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  sub: { fontSize: 12, color: '#7A93AC', marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  expiredTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  expiredSub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 19 },

  contextStrip: {
    backgroundColor: '#0D1B2E', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#12233B',
  },
  contextText: { fontSize: 11, color: '#5A7A9A', textAlign: 'center', lineHeight: 15 },

  list: { padding: 16, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleMine:   { alignSelf: 'flex-end', backgroundColor: '#29B6F6', borderBottomRightRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: '#f8fafc', lineHeight: 19 },
  emptyText: { fontSize: 13, color: '#4A6580', textAlign: 'center', marginTop: 30 },

  contactRow: { paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#0D1B2E' },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#29B6F644', borderRadius: 10, paddingVertical: 9,
    backgroundColor: '#29B6F610',
  },
  contactBtnText: { fontSize: 13, fontWeight: '700', color: '#29B6F6' },
  contactPending: { fontSize: 12, color: '#7A93AC', textAlign: 'center', fontStyle: 'italic' },
  contactRevealed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  contactRevealedText: { fontSize: 13, color: '#22c55e' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingTop: 8,
  },
  input: {
    flex: 1, backgroundColor: '#0D1B2E', borderRadius: 20, borderWidth: 1, borderColor: '#1A2E4A',
    paddingHorizontal: 14, paddingVertical: 10, color: '#f8fafc', fontSize: 14, maxHeight: 110,
  },
  sendBtn: {
    backgroundColor: '#29B6F6', borderRadius: 20, width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  lockedBanner: {
    paddingHorizontal: 24, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#0D1B2E',
  },
  lockedText: { fontSize: 12, color: '#7A93AC', textAlign: 'center', lineHeight: 17 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(5,10,21,0.85)', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: {
    backgroundColor: '#0D1B2E', borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 10,
    ...Platform.select({ web: { maxWidth: 440, alignSelf: 'center', width: '100%' } as any, default: {} }),
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  modalSub: { fontSize: 12, color: '#7A93AC', lineHeight: 17 },
  modalInput: {
    backgroundColor: '#050A15', borderRadius: 12, borderWidth: 1, borderColor: '#1A2E4A',
    padding: 12, color: '#f8fafc', fontSize: 14,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18 },
  modalCancel: { fontSize: 14, color: '#7A93AC', fontWeight: '600' },
  modalSend: { backgroundColor: '#29B6F6', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, minWidth: 70, alignItems: 'center' },
  modalSendText: { color: '#050A15', fontWeight: '800', fontSize: 14 },
})
