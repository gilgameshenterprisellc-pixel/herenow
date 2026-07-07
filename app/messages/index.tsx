import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDmThreads } from '@/hooks/useMessages'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'

export default function MessagesScreen() {
  const insets = useSafeAreaInsets()
  const [userId, setUserId] = useState<string | null>(null)
  const { threads, loading, refresh } = useDmThreads(userId ?? '')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    if (diffMs < 60_000) return 'now'
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const getExpiryStatus = (expiresAt: string | null) => {
    if (expiresAt === null) return { locked: true, expired: false, label: '🔒', warn: false }
    const ms = new Date(expiresAt).getTime() - Date.now()
    if (ms < 0) return { locked: false, expired: true, label: 'Expired', warn: false }
    const hrs = Math.floor(ms / 3_600_000)
    if (hrs < 2) return { locked: false, expired: false, label: `${hrs}h left`, warn: true }
    return { locked: false, expired: false, label: null, warn: false }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} />
        <Text style={styles.title}>Messages 💌</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#29B6F6" />
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.we_met_id}
          contentContainerStyle={styles.list}
          onRefresh={refresh}
          refreshing={loading}
          renderItem={({ item }) => {
            const expiry = getExpiryStatus(item.expires_at)
            const isMe = item.last_sender_id === userId
            return (
              <TouchableOpacity
                style={[styles.thread, expiry.expired && styles.threadExpired, expiry.locked && styles.threadLocked]}
                onPress={() => router.push(`/messages/${item.we_met_id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(item.other_display_name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.info}>
                  <View style={styles.row}>
                    <Text style={[styles.name, expiry.expired && styles.nameFaded]}>
                      {item.other_display_name ?? 'Unknown'}
                    </Text>
                    <Text style={styles.time}>
                      {item.last_message_at ? formatTime(item.last_message_at) : ''}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text
                      style={[styles.preview, !item.last_content && styles.previewEmpty]}
                      numberOfLines={1}
                    >
                      {item.last_content
                        ? isMe
                          ? `You: ${item.last_content}`
                          : item.last_content
                        : 'No messages yet'}
                    </Text>
                    {expiry.locked && (
                      <Text style={styles.expiryLocked}>🔒 At venue</Text>
                    )}
                    {expiry.warn && !expiry.expired && (
                      <Text style={styles.expiryWarn}>{expiry.label}</Text>
                    )}
                    {expiry.expired && (
                      <Text style={styles.expiryDead}>Expired</Text>
                    )}
                  </View>
                  {!expiry.expired && !expiry.warn && (
                    <Text style={styles.expiryNote}>
                      Met at {item.zone_name ?? 'a venue'}
                    </Text>
                  )}
                </View>
                {!expiry.expired && !expiry.locked && item.unread_count > 0 && (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💌</Text>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>
                Confirm a "We Met" with someone you actually met in person to unlock DMs.
                Messages expire after 72 hours (Premium: 14 days).
              </Text>
              <TouchableOpacity
                style={styles.wemetLink}
                onPress={() => router.push('/we-met')}
              >
                <Text style={styles.wemetLinkText}>Check We Met requests →</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
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
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  list: { padding: 14, gap: 2, paddingBottom: 80 },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  threadExpired: { opacity: 0.4 },
  threadLocked: { opacity: 0.7 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0D1B2E',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#8EADC7' },
  info: { flex: 1, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  nameFaded: { color: '#4A6580' },
  time: { fontSize: 11, color: '#7A93AC' },
  preview: { fontSize: 13, color: '#7A93AC', flex: 1 },
  previewEmpty: { fontStyle: 'italic' },
  expiryNote: { fontSize: 11, color: '#4A6580' },
  expiryLocked: { fontSize: 11, fontWeight: '700', color: '#7A93AC' },
  expiryWarn: { fontSize: 11, fontWeight: '700', color: '#29B6F6' },
  expiryDead: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#29B6F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  unreadText: { fontSize: 11, fontWeight: '800', color: '#050A15' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
  wemetLink: { marginTop: 8 },
  wemetLinkText: { color: '#29B6F6', fontWeight: '700', fontSize: 14 },
})
