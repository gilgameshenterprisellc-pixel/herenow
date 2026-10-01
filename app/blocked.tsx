import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocks'

// Everyone I have blocked, with a way to undo it. Labels are whatever the
// blocker could already see when they blocked ("Guest 3 at The Lantern Room",
// "Board poster"), so this screen never reveals who an anonymous person was.
export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [users, setUsers]     = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setUsers(await fetchBlockedUsers())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleUnblock = (u: BlockedUser) => {
    platformConfirm(
      `Unblock ${u.label ?? 'this person'}?`,
      'They will be able to appear in Pulse, Chat and People again, and to send you We Met requests and messages.',
      async () => {
        try {
          await unblockUser(u.blocked_id)
          setUsers((prev) => prev.filter((x) => x.blocked_id !== u.blocked_id))
          showToast('Unblocked.', 'success')
        } catch {
          showToast('Could not unblock. Try again.', 'error')
        }
      },
      { confirmText: 'Unblock' },
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/settings' as any)} />
        <Text style={styles.title}>Blocked users</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#29B6F6" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.blocked_id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.intro}>
              Blocked people can't see you, message you or send We Met requests, and you won't see them anywhere in HereNow.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Ionicons name="ban" size={16} color="#7A93AC" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.label ?? 'Blocked user'}</Text>
                <Text style={styles.sub}>Blocked {new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(item)}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${item.label ?? 'this person'}`}
              >
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark" size={26} color="#29B6F6" />
              <Text style={styles.emptyTitle}>No one blocked</Text>
              <Text style={styles.emptySub}>
                To block someone, tap the options button on their message, post or conversation.
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
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  intro: { fontSize: 13, color: '#7A93AC', lineHeight: 19, marginBottom: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 14, borderWidth: 1, borderColor: '#1A2E4A',
    padding: 14,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A2E4A',
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  sub: { fontSize: 12, color: '#5A7A9A', marginTop: 2 },
  unblockBtn: {
    borderWidth: 1, borderColor: '#29B6F666', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center',
  },
  unblockText: { fontSize: 13, fontWeight: '700', color: '#29B6F6' },
  empty: { alignItems: 'center', paddingTop: 70, gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 19 },
})
