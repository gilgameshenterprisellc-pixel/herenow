import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'

interface AdminUser {
  id: string
  display_name: string
  username: string | null
  is_muted: boolean
  is_banned: boolean
  is_admin: boolean
  venue_status: string | null
  created_at: string
}

export default function AdminUsers() {
  const insets = useSafeAreaInsets()
  const [users, setUsers]         = useState<AdminUser[]>([])
  const [filtered, setFiltered]   = useState<AdminUser[]>([])
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [acting, setActing]       = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, username, is_muted, is_banned, is_admin, venue_status, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    const list = (data ?? []) as AdminUser[]
    setUsers(list)
    setFiltered(list)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = query.toLowerCase()
    setFiltered(users.filter((u) =>
      u.display_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q)
    ))
  }, [query, users])

  const onRefresh = () => { setRefreshing(true); load() }

  const toggleMute = (user: AdminUser) => {
    const label = user.is_muted ? 'Unmute' : 'Mute'
    const msg = user.is_muted ? 'They will be able to post again.' : 'They will not be able to create posts or send chat messages.'

    const doMute = async () => {
      setActing(user.id)
      await supabase.rpc('admin_set_user_muted', { p_user_id: user.id, p_muted: !user.is_muted })
      setActing(null)
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_muted: !u.is_muted } : u))
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(`${label} ${user.display_name}?\n\n${msg}`)
      if (ok) doMute()
    } else {
      Alert.alert(`${label} ${user.display_name}?`, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: user.is_muted ? 'default' : 'destructive', onPress: doMute },
      ])
    }
  }

  // Ejects the account from the whole app (signed out on next auth check, and
  // blocked from posting to pulse/chat/Board at the database level) — not the
  // same as Mute, which only stops new posts. See Apple Guideline 1.2.
  const toggleBan = (user: AdminUser) => {
    const label = user.is_banned ? 'Unban' : 'Ban'
    const msg = user.is_banned
      ? 'They will be able to sign in and use the app again.'
      : 'They will be signed out, unable to sign back in, and unable to post anywhere. This is for confirmed violations of the Community Guidelines.'

    const doBan = async () => {
      setActing(user.id)
      await supabase.rpc('admin_set_user_banned', {
        p_user_id: user.id,
        p_banned: !user.is_banned,
        p_reason: user.is_banned ? null : 'Banned via admin panel',
      })
      setActing(null)
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: !u.is_banned } : u))
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(`${label} ${user.display_name}?\n\n${msg}`)
      if (ok) doBan()
    } else {
      Alert.alert(`${label} ${user.display_name}?`, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: user.is_banned ? 'default' : 'destructive', onPress: doBan },
      ])
    }
  }

  const renderUser = ({ item }: { item: AdminUser }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.display_name}</Text>
            {item.is_admin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>}
            {item.is_muted && <View style={styles.mutedBadge}><Text style={styles.mutedBadgeText}>MUTED</Text></View>}
            {item.is_banned && <View style={styles.bannedBadge}><Text style={styles.bannedBadgeText}>BANNED</Text></View>}
          </View>
          {item.username ? <Text style={styles.username}>@{item.username}</Text> : null}
          {item.venue_status === 'approved' && <Text style={styles.venueBadge}>Venue owner</Text>}
        </View>
      </View>
      {acting === item.id ? (
        <ActivityIndicator color="#29B6F6" size="small" />
      ) : (
        <View style={styles.rowActions}>
          <TouchableOpacity
            style={[styles.muteBtn, item.is_muted && styles.muteBtnActive]}
            onPress={() => toggleMute(item)}
          >
            <Text style={[styles.muteBtnText, item.is_muted && styles.muteBtnTextActive]}>
              {item.is_muted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.banBtn, item.is_banned && styles.banBtnActive]}
            onPress={() => toggleBan(item)}
          >
            <Text style={[styles.banBtnText, item.is_banned && styles.banBtnTextActive]}>
              {item.is_banned ? 'Unban' : 'Ban'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => router.push('/')} />
        <Text style={styles.title}>User Management</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or @username…"
          placeholderTextColor="#4A6580"
        />
      </View>

      {loading ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={filtered}
          keyExtractor={(u) => u.id}
          renderItem={renderUser}
          contentContainerStyle={[
            styles.list,
            Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No users found</Text>
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
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  searchWrap: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  search: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  list: { padding: 12, paddingBottom: 60 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#29B6F620', borderWidth: 1, borderColor: '#29B6F6',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#29B6F6' },
  rowInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  adminBadge: {
    backgroundColor: '#f59e0b20', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#f59e0b',
  },
  adminBadgeText: { fontSize: 9, fontWeight: '800', color: '#f59e0b', letterSpacing: 0.5 },
  mutedBadge: {
    backgroundColor: '#ef444420', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#ef4444',
  },
  mutedBadgeText: { fontSize: 9, fontWeight: '800', color: '#ef4444', letterSpacing: 0.5 },
  bannedBadge: {
    backgroundColor: '#7f1d1d40', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#dc2626',
  },
  bannedBadgeText: { fontSize: 9, fontWeight: '800', color: '#dc2626', letterSpacing: 0.5 },
  username: { fontSize: 12, color: '#7A93AC' },
  venueBadge: { fontSize: 11, color: '#29B6F6' },
  rowActions: { flexDirection: 'row', gap: 8 },
  muteBtn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  muteBtnActive: { borderColor: '#ef4444', backgroundColor: '#ef444415' },
  muteBtnText: { fontSize: 12, fontWeight: '600', color: '#7A93AC' },
  muteBtnTextActive: { color: '#ef4444' },
  banBtn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  banBtnActive: { borderColor: '#dc2626', backgroundColor: '#7f1d1d20' },
  banBtnText: { fontSize: 12, fontWeight: '600', color: '#7A93AC' },
  banBtnTextActive: { color: '#dc2626' },
  sep: { height: 1, backgroundColor: '#0D1B2E', marginHorizontal: 4 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 14, color: '#7A93AC' },
})
