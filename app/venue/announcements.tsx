import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import {
  fetchAnnouncements, sendAnnouncement, deleteAnnouncement, type Announcement,
} from '@/lib/announcements'

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `Expires in ${h}h ${m}m`
  return `Expires in ${m}m`
}

export default function VenueAnnouncements() {
  const insets = useSafeAreaInsets()
  const [zoneId, setZoneId]               = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading]             = useState(true)
  const [refreshing, setRefreshing]       = useState(false)
  const [message, setMessage]             = useState('')
  const [sending, setSending]             = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: zones } = await supabase
      .from('zones')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)

    const id = zones?.[0]?.id ?? null
    setZoneId(id)

    if (id) {
      const data = await fetchAnnouncements(id)
      setAnnouncements(data)
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleSend = async () => {
    if (!message.trim() || !zoneId) return
    setSending(true)
    await sendAnnouncement({ zoneId, message: message.trim() })
    setMessage('')
    setSending(false)
    load()
  }

  const handleDelete = (a: Announcement) => {
    Alert.alert(
      'Delete announcement?',
      'It will disappear from all checked-in guests immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAnnouncement(a.id)
            load()
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Announce</Text>
          <Text style={styles.subtitle}>Broadcast to everyone checked in right now</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Compose */}
        <View style={styles.composeCard}>
          <Text style={styles.composeLabel}>New Announcement</Text>
          <TextInput
            style={styles.composeInput}
            value={message}
            onChangeText={setMessage}
            placeholder='e.g. "Happy hour starts NOW 🍺 All cocktails $5 for the next hour!"'
            placeholderTextColor="#4A6580"
            multiline
            maxLength={280}
          />
          <View style={styles.composeFooter}>
            <Text style={styles.charCount}>{message.length}/280</Text>
            <Text style={styles.expireNote}>Disappears automatically after 2 hours</Text>
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!message.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#050A15" size="small" />
              : <Text style={styles.sendBtnText}>📣 Send to Everyone</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Active announcements */}
        {announcements.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Active ({announcements.length})</Text>
            {announcements.map((a) => (
              <View key={a.id} style={styles.announcementCard}>
                <Text style={styles.announcementMsg}>{a.message}</Text>
                <View style={styles.announcementFooter}>
                  <Text style={styles.announcementTime}>{timeRemaining(a.expires_at)}</Text>
                  <TouchableOpacity onPress={() => handleDelete(a)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {announcements.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📣</Text>
            <Text style={styles.emptyTitle}>No active announcements</Text>
            <Text style={styles.emptySub}>
              Announcements go live instantly and auto-expire after 2 hours. Guests see them as a banner at the top of the zone screen.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn:    { padding: 8, paddingTop: 2 },
  backText:   { fontSize: 22, color: '#f8fafc' },
  headerInfo: { flex: 1 },
  title:      { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  subtitle:   { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  scroll:     { flex: 1 },
  content:    { padding: 16, gap: 14, paddingBottom: 40 },

  composeCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#29B6F630',
    gap: 12,
  },
  composeLabel: { fontSize: 13, fontWeight: '800', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  composeInput: {
    backgroundColor: '#0A1628',
    borderRadius: 12,
    padding: 14,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    minHeight: 100,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  composeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -4,
  },
  charCount:   { fontSize: 11, color: '#4A6580' },
  expireNote:  { fontSize: 11, color: '#4A6580' },
  sendBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { color: '#050A15', fontWeight: '800', fontSize: 15 },

  section:      { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#4A6580', textTransform: 'uppercase', letterSpacing: 0.5 },
  announcementCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 10,
  },
  announcementMsg:    { fontSize: 14, color: '#f8fafc', lineHeight: 20 },
  announcementFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  announcementTime:   { fontSize: 11, color: '#4A6580' },
  deleteBtn:          { padding: 4 },
  deleteBtnText:      { fontSize: 12, color: '#ef4444', fontWeight: '600' },

  empty:      { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
})
