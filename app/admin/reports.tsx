import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

type ReportTab = 'content' | 'users'

interface ContentReport {
  id: string
  content_type: 'pulse_post' | 'chat_message'
  content_id: string
  reason: string
  status: string
  created_at: string
  reporter: { display_name: string } | null
  // resolved content (joined manually)
  content_text?: string
  content_author?: string
}

interface UserReport {
  id: string
  reason: string
  created_at: string
  reporter: { display_name: string } | null
  reported: { display_name: string; is_muted: boolean } | null
  reported_id: string
}

export default function AdminReports() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [tab, setTab]             = useState<ReportTab>('content')
  const [content, setContent]     = useState<ContentReport[]>([])
  const [users, setUsers]         = useState<UserReport[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [acting, setActing]       = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: cReports }, { data: uReports }] = await Promise.all([
      supabase
        .from('content_reports')
        .select('id, content_type, content_id, reason, status, created_at, reporter:reporter_id(display_name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('safety_reports')
        .select('id, reason, created_at, reported_id, reporter:reporter_id(display_name), reported:reported_id(display_name, is_muted)')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    // For content reports, try to fetch the actual post/message content
    const enriched: ContentReport[] = await Promise.all(
      (cReports ?? []).map(async (r: any) => {
        let text = '[content unavailable]'
        let author = 'unknown'
        if (r.content_type === 'pulse_post') {
          const { data } = await supabase
            .from('pulse_posts')
            .select('content, profiles(display_name)')
            .eq('id', r.content_id)
            .maybeSingle()
          text = (data as any)?.content ?? '[no text]'
          author = (data as any)?.profiles?.display_name ?? 'unknown'
        } else if (r.content_type === 'chat_message') {
          const { data } = await supabase
            .from('venue_chat')
            .select('content, profiles(display_name)')
            .eq('id', r.content_id)
            .maybeSingle()
          text = (data as any)?.content ?? '[no text]'
          author = (data as any)?.profiles?.display_name ?? 'unknown'
        }
        return { ...r, reporter: r.reporter, content_text: text, content_author: author }
      })
    )

    setContent(enriched)
    setUsers((uReports ?? []).map((r: any) => ({
      ...r,
      reporter: r.reporter,
      reported: r.reported,
    })))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const hideContent = async (report: ContentReport) => {
    setActing(report.id)
    await supabase.rpc('admin_set_content_hidden', {
      p_content_type: report.content_type,
      p_content_id: report.content_id,
      p_hidden: true,
    })
    await supabase.from('content_reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', report.id)
    setActing(null)
    setContent((prev) => prev.filter((r) => r.id !== report.id))
  }

  const dismissContent = async (report: ContentReport) => {
    setActing(report.id)
    await supabase.from('content_reports').update({ status: 'dismissed' }).eq('id', report.id)
    setActing(null)
    setContent((prev) => prev.filter((r) => r.id !== report.id))
  }

  const muteUser = async (report: UserReport) => {
    const doMute = async () => {
      setActing(report.id)
      await supabase.rpc('admin_set_user_muted', { p_user_id: report.reported_id, p_muted: true })
      setActing(null)
      setUsers((prev) => prev.map((r) =>
        r.id === report.id ? { ...r, reported: r.reported ? { ...r.reported, is_muted: true } : null } : r
      ))
      showToast(`${report.reported?.display_name ?? 'User'} has been muted.`, 'success')
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(`Mute ${report.reported?.display_name}?\n\nThey will not be able to post or send messages until unmuted.`)
      if (ok) doMute()
    } else {
      Alert.alert(
        `Mute ${report.reported?.display_name}?`,
        'They will not be able to post or send messages until unmuted.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mute', style: 'destructive', onPress: doMute },
        ]
      )
    }
  }

  const unmuteUser = async (report: UserReport) => {
    setActing(report.id)
    await supabase.rpc('admin_set_user_muted', { p_user_id: report.reported_id, p_muted: false })
    setActing(null)
    setUsers((prev) => prev.map((r) =>
      r.id === report.id ? { ...r, reported: r.reported ? { ...r.reported, is_muted: false } : null } : r
    ))
  }

  const renderContentReport = ({ item }: { item: ContentReport }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportMeta}>
        <View style={[styles.typePill, item.content_type === 'pulse_post' ? styles.typePost : styles.typeChat]}>
          <Text style={styles.typePillText}>{item.content_type === 'pulse_post' ? '✨ Pulse' : '💬 Chat'}</Text>
        </View>
        <Text style={styles.reportReason}>Reason: {item.reason.replace(/_/g, ' ')}</Text>
      </View>

      <View style={styles.contentBox}>
        <Text style={styles.contentAuthor}>by {item.content_author}</Text>
        <Text style={styles.contentText} numberOfLines={3}>{item.content_text}</Text>
      </View>

      <Text style={styles.reportedBy}>Reported by {item.reporter?.display_name ?? 'unknown'}</Text>

      {acting === item.id ? (
        <ActivityIndicator color="#29B6F6" style={{ marginTop: 8 }} />
      ) : (
        <View style={styles.reportActions}>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => dismissContent(item)}>
            <Text style={styles.dismissBtnText}>Dismiss</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.hideBtn} onPress={() => hideContent(item)}>
            <Text style={styles.hideBtnText}>Hide Content</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )

  const renderUserReport = ({ item }: { item: UserReport }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportMeta}>
        <Text style={styles.reportReason}>Reason: {item.reason.replace(/_/g, ' ')}</Text>
        {item.reported?.is_muted && (
          <View style={styles.mutedBadge}>
            <Text style={styles.mutedBadgeText}>MUTED</Text>
          </View>
        )}
      </View>

      <Text style={styles.contentAuthor}>
        Reported user: <Text style={styles.userName}>{item.reported?.display_name ?? 'unknown'}</Text>
      </Text>
      <Text style={styles.reportedBy}>Reported by {item.reporter?.display_name ?? 'unknown'}</Text>

      {acting === item.id ? (
        <ActivityIndicator color="#29B6F6" style={{ marginTop: 8 }} />
      ) : (
        <View style={styles.reportActions}>
          {item.reported?.is_muted ? (
            <TouchableOpacity style={styles.dismissBtn} onPress={() => unmuteUser(item)}>
              <Text style={styles.dismissBtnText}>Unmute</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.hideBtn} onPress={() => muteUser(item)}>
              <Text style={styles.hideBtnText}>Mute User</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.push('/')} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Reports Queue</Text>
      </View>

      <View style={styles.tabs}>
        {(['content', 'users'] as ReportTab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'content' ? '🚩 Content' : '👤 Users'}
            </Text>
            {t === 'content' && content.length > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{content.length}</Text></View>
            )}
            {t === 'users' && users.length > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{users.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : tab === 'content' ? (
        <FlatList
          data={content}
          keyExtractor={(r) => r.id}
          renderItem={renderContentReport}
          contentContainerStyle={[
            styles.list,
            Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>No open content reports</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(r) => r.id}
          renderItem={renderUserReport}
          contentContainerStyle={[
            styles.list,
            Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>No user safety reports</Text>
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    paddingHorizontal: 16,
    gap: 4,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#29B6F6' },
  tabText: { fontSize: 14, color: '#7A93AC', fontWeight: '600' },
  tabTextActive: { color: '#29B6F6' },
  tabBadge: {
    backgroundColor: '#ef4444', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  list: { padding: 16, gap: 12, paddingBottom: 60 },
  reportCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 8,
  },
  reportMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typePost: { backgroundColor: '#a855f718', borderWidth: 1, borderColor: '#a855f733' },
  typeChat: { backgroundColor: '#06b6d418', borderWidth: 1, borderColor: '#06b6d433' },
  typePillText: { fontSize: 11, fontWeight: '600', color: '#f8fafc' },
  reportReason: { fontSize: 12, color: '#8EADC7', flex: 1 },
  mutedBadge: {
    backgroundColor: '#ef444420', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#ef4444',
  },
  mutedBadgeText: { fontSize: 10, fontWeight: '800', color: '#ef4444', letterSpacing: 0.5 },
  contentBox: {
    backgroundColor: '#050A15', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#0D1B2E', gap: 4,
  },
  contentAuthor: { fontSize: 12, color: '#7A93AC' },
  contentText: { fontSize: 13, color: '#D0E8F5', lineHeight: 18 },
  userName: { color: '#f8fafc', fontWeight: '700' },
  reportedBy: { fontSize: 12, color: '#4A6580' },
  reportActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dismissBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 9,
    alignItems: 'center', borderWidth: 1, borderColor: '#1A2E4A',
  },
  dismissBtnText: { fontSize: 13, fontWeight: '600', color: '#7A93AC' },
  hideBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 9,
    alignItems: 'center', backgroundColor: '#ef444415',
    borderWidth: 1, borderColor: '#ef4444',
  },
  hideBtnText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
})
