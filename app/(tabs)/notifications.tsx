import { useEffect } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TAB_SAFE_BOTTOM } from './_layout'
import { router } from 'expo-router'
import { useNotifications } from '@/hooks/useNotifications'
import { markOneRead, markAllRead } from '@/lib/notifications'

const TYPE_META: Record<string, { emoji: string; color: string }> = {
  wemet_request:   { emoji: '🤝', color: '#29B6F6' },
  wemet_confirmed: { emoji: '✅', color: '#22c55e' },
  message:         { emoji: '💌', color: '#3b82f6' },
  event_rsvp:      { emoji: '📅', color: '#a855f7' },
  badge_earned:    { emoji: '🏅', color: '#29B6F6' },
  system:          { emoji: '📡', color: '#7A93AC' },
}

function timeAgo(iso: string): string {
  const ms  = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'just now'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const { notifications, loading, unreadCount: unread, refresh } = useNotifications()

  const handlePress = async (n: (typeof notifications)[0]) => {
    if (!n.is_read) await markOneRead(n.id)
    const d = n.data as Record<string, any> | null

    if (n.type === 'wemet_request' || n.type === 'wemet_confirmed') {
      router.push('/we-met')
    } else if (n.type === 'message' && d?.we_met_id) {
      router.push(`/messages/${d.we_met_id}`)
    } else if (n.type === 'badge_earned') {
      router.push('/badges')
    } else if (d?.zone_id) {
      router.push(`/zone/${d.zone_id}`)
    }
    refresh()
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.title}>Notifications 🔔</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={() => { markAllRead().then(refresh) }}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#29B6F6" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          onRefresh={refresh}
          refreshing={loading}
          renderItem={({ item: n }) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.system
            return (
              <TouchableOpacity
                style={[styles.row, !n.is_read && styles.rowUnread]}
                onPress={() => handlePress(n)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconBox, { backgroundColor: meta.color + '18' }]}>
                  <Text style={styles.icon}>{meta.emoji}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                  <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
                </View>
                {!n.is_read && <View style={[styles.dot, { backgroundColor: meta.color }]} />}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptySub}>
                Check in to a venue to start getting We Met requests, messages, and event updates.
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  markAllText: { fontSize: 13, color: '#29B6F6', fontWeight: '600' },
  list: { padding: 14, paddingBottom: TAB_SAFE_BOTTOM, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#050A15',
    borderRadius: 8,
  },
  rowUnread: {
    backgroundColor: '#29B6F606',
    borderBottomColor: '#0D1B2E',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 20 },
  info: { flex: 1, gap: 2 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  notifBody: { fontSize: 12, color: '#8EADC7', lineHeight: 16 },
  time: { fontSize: 11, color: '#4A6580' },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
})
