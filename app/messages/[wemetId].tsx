import { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useDmThread } from '@/hooks/useMessages'
import { sendMessage, markMessagesRead, isPermanentDm } from '@/lib/messages'
import { unmeet } from '@/lib/weMet'
import { platformConfirm } from '@/lib/confirm'
import DmBubble from '@/components/DmBubble'
import ExpiryLabel from '@/components/ExpiryLabel'
import BackButton from '@/components/BackButton'

export default function DmConversationScreen() {
  const { wemetId }         = useLocalSearchParams<{ wemetId: string }>()
  const insets              = useSafeAreaInsets()
  const [userId, setUserId] = useState<string | null>(null)
  const [text, setText]     = useState('')
  const [sending, setSending] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [otherName, setOtherName] = useState('')
  const [otherId, setOtherId]     = useState<string | null>(null)
  const [notFound, setNotFound]   = useState(false)
  const listRef = useRef<FlatList>(null)

  const { messages, loading } = useDmThread(wemetId, userId ?? '')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data: wm, error: wmErr } = await supabase
        .from('we_met')
        .select('expires_at, initiator_id, recipient_id')
        .eq('id', wemetId)
        .maybeSingle()

      if (wmErr || !wm) {
        setNotFound(true)
        return
      }

      setExpiresAt(wm.expires_at)
      const otherUserId = wm.initiator_id === user?.id ? wm.recipient_id : wm.initiator_id
      setOtherId(otherUserId)
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', otherUserId)
        .maybeSingle()
      setOtherName(profile?.display_name ?? 'Unknown')

      if (user) await markMessagesRead(wemetId, user.id)
    }
    init()
  }, [wemetId])

  const handleSend = async () => {
    if (!text.trim() || sending || !userId) return
    setSending(true)
    await sendMessage({ wemetId, content: text.trim() })
    setText('')
    setSending(false)
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }

  const isPermanent = isPermanentDm(expiresAt)
  const isExpired   = !isPermanent && expiresAt !== null && new Date(expiresAt) < new Date()

  const handleUnmeet = () => {
    platformConfirm(
      'Unmeet',
      `End your connection with ${otherName || 'this person'}? The chat disappears for both of you. They won't be notified.`,
      async () => {
        const ok = await unmeet(wemetId)
        if (ok) {
          router.canGoBack() ? router.back() : router.replace('/messages' as any)
        }
      },
      { confirmText: 'Unmeet', cancelText: 'Keep', destructive: true }
    )
  }

  if (notFound) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/messages' as any)} />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>Conversation</Text>
          </View>
        </View>
        <View style={styles.center}>
          <Text style={{ fontSize: 36 }}>💌</Text>
          <Text style={[styles.name, { marginTop: 12 }]}>Thread not found</Text>
          <Text style={[styles.expiredText, { marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }]}>
            This conversation may have expired or been removed.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/messages' as any)} />
        <View style={styles.headerInfo}>
          <TouchableOpacity onPress={() => otherId && router.push(`/u/${otherId}` as any)} disabled={!otherId}>
            <Text style={styles.name}>{otherName} ›</Text>
          </TouchableOpacity>
          {expiresAt && !isExpired && (
            <ExpiryLabel
              expiresAt={expiresAt}
              prefix={messages.length === 0 ? 'First move' : 'Reply window'}
            />
          )}
        </View>
        <TouchableOpacity onPress={handleUnmeet} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.unmeetText}>Unmeet</Text>
        </TouchableOpacity>
      </View>

      {/* First 48 hint — window is live, nobody has made the first move yet */}
      {!isExpired && !isPermanent && !loading && messages.length === 0 && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedText}>
            ⏱ First 48 — someone has 48 hours to say hi. One reply keeps this chat open for good.
          </Text>
        </View>
      )}

      {/* Expired notice */}
      {isExpired && (
        <View style={styles.expiredBanner}>
          <Text style={styles.expiredText}>
            This conversation expired. Messages are read-only.
          </Text>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#29B6F6" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <DmBubble message={item} currentUserId={userId ?? ''} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💌</Text>
              <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptySub}>
                You actually met this person. Say hi!
              </Text>
            </View>
          }
        />
      )}

      {/* Compose */}
      {!isExpired && (
        <View style={[styles.compose, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor="#4A6580"
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            maxLength={1000}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#050A15" size="small" />
              : <Text style={styles.sendIcon}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  headerInfo: { flex: 1 },
  name: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  lockedBanner: {
    backgroundColor: '#0D1B2E',
    borderBottomWidth: 1,
    borderBottomColor: '#1A2E4A',
    padding: 12,
    alignItems: 'center',
  },
  lockedText: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
  unmeetText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  expiredBanner: {
    backgroundColor: '#1e1010',
    borderBottomWidth: 1,
    borderBottomColor: '#450a0a',
    padding: 10,
    alignItems: 'center',
  },
  expiredText: { fontSize: 12, color: '#ef4444', textAlign: 'center' },
  list: { padding: 14, gap: 6 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#0D1B2E',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#29B6F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { fontSize: 18, fontWeight: '800', color: '#050A15' },
})
