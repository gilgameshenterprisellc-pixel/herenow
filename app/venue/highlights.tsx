import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { fetchHighlights, createHighlight, deleteHighlight, type VenueHighlight } from '@/lib/highlights'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import BackButton from '@/components/BackButton'

const EMOJIS = ['⭐', '🔥', '🎉', '🍹', '🎵', '🌃', '🎭', '🎮', '🍔', '🥳', '💫', '🏆']
const MAX = 6

export default function VenueHighlightsScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [zoneId, setZoneId]           = useState<string | null>(null)
  const [highlights, setHighlights]   = useState<VenueHighlight[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [saving, setSaving]           = useState(false)

  // New highlight form
  const [title, setTitle]   = useState('')
  const [body, setBody]     = useState('')
  const [emoji, setEmoji]   = useState('⭐')

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: zone } = await supabase
      .from('zones')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!zone) { setLoading(false); setRefreshing(false); return }

    setZoneId(zone.id)
    const data = await fetchHighlights(zone.id)
    setHighlights(data)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const handleAdd = async () => {
    if (!zoneId || !title.trim()) { showToast('Title required.', 'error'); return }
    if (highlights.length >= MAX) { showToast(`Max ${MAX} highlights — delete one first to add another.`, 'info'); return }

    setSaving(true)
    const created = await createHighlight({
      zoneId,
      title: title.trim(),
      body: body.trim() || undefined,
      emoji,
    })
    if (created) {
      setHighlights((prev) => [...prev, created])
      setTitle('')
      setBody('')
      setEmoji('⭐')
    }
    setSaving(false)
  }

  const handleDelete = (id: string, hlTitle: string) => {
    platformConfirm(
      `Remove "${hlTitle}"?`,
      'This will remove the highlight from your venue showcase.',
      async () => {
        await deleteHighlight(id)
        setHighlights((prev) => prev.filter((h) => h.id !== id))
      },
      { confirmText: 'Remove', destructive: true }
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <Text style={styles.title}>Venue Highlights</Text>
        <Text style={styles.counter}>{highlights.length}/{MAX}</Text>
      </View>

      <ScrollView
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
      >
        <Text style={styles.sectionHint}>
          Highlights appear on your venue's page for everyone to see — not just checked-in guests. Show off what makes your spot special.
        </Text>

        {/* Existing highlights */}
        {highlights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CURRENT HIGHLIGHTS</Text>
            {highlights.map((h) => (
              <View key={h.id} style={styles.hlCard}>
                <Text style={styles.hlEmoji}>{h.emoji ?? '⭐'}</Text>
                <View style={styles.hlBody}>
                  <Text style={styles.hlTitle}>{h.title}</Text>
                  {h.body ? <Text style={styles.hlText}>{h.body}</Text> : null}
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(h.id, h.title)}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Add new */}
        {highlights.length < MAX && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ADD HIGHLIGHT</Text>

            <Text style={styles.label}>Emoji</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
              {EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
                  onPress={() => setEmoji(e)}
                >
                  <Text style={styles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Happy Hour 5–8pm"
              placeholderTextColor="#4A6580"
              maxLength={60}
            />

            <Text style={styles.label}>Details (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={body}
              onChangeText={setBody}
              placeholder="e.g. $5 craft cocktails, live DJ on weekends"
              placeholderTextColor="#4A6580"
              multiline
              maxLength={200}
            />

            <TouchableOpacity
              style={[styles.addBtn, (!title.trim() || saving) && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!title.trim() || saving}
            >
              {saving
                ? <ActivityIndicator color="#050A15" size="small" />
                : <Text style={styles.addBtnText}>+ Add Highlight</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {highlights.length >= MAX && (
          <View style={styles.maxNote}>
            <Text style={styles.maxNoteText}>Maximum {MAX} highlights reached. Remove one to add another.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  counter: { fontSize: 13, color: '#7A93AC', fontWeight: '600' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 60 },
  sectionHint: { fontSize: 13, color: '#7A93AC', lineHeight: 19 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#7A93AC',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  hlCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  hlEmoji: { fontSize: 22 },
  hlBody: { flex: 1, gap: 3 },
  hlTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  hlText:  { fontSize: 13, color: '#8EADC7', lineHeight: 18 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14, color: '#7A93AC' },
  label: {
    fontSize: 11, fontWeight: '700', color: '#8EADC7',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  emojiRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  emojiBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0D1B2E', borderWidth: 2, borderColor: '#1A2E4A',
  },
  emojiBtnActive: { borderColor: '#29B6F6', backgroundColor: '#29B6F615' },
  emojiText: { fontSize: 20 },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  addBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { fontSize: 15, fontWeight: '800', color: '#050A15' },
  maxNote: {
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', alignItems: 'center',
  },
  maxNoteText: { fontSize: 13, color: '#7A93AC', textAlign: 'center' },
})
