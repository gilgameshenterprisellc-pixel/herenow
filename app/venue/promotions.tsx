import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, RefreshControl, Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'

interface Promotion {
  id: string
  title: string
  description: string | null
  discount_label: string | null
  post_to_feed: boolean
  expires_at: string | null
  created_at: string
}

export default function VenuePromotionsScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [zoneId, setZoneId]         = useState<string | null>(null)
  const [promos, setPromos]         = useState<Promotion[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving]         = useState(false)

  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [discountLabel, setDiscountLabel] = useState('')
  const [postToFeed, setPostToFeed] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: zone } = await supabase
      .from('zones').select('id').eq('owner_id', user.id).maybeSingle()

    if (!zone) { setLoading(false); setRefreshing(false); return }
    setZoneId(zone.id)

    const { data } = await supabase
      .from('venue_promotions')
      .select('id, title, description, discount_label, post_to_feed, expires_at, created_at')
      .eq('zone_id', zone.id)
      .order('created_at', { ascending: false })

    setPromos((data ?? []) as Promotion[])
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const handleCreate = async () => {
    if (!zoneId || !title.trim()) { showToast('Title required.', 'error'); return }

    setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setSaving(false); return }

    const { data, error } = await supabase
      .from('venue_promotions')
      .insert({
        zone_id:        zoneId,
        created_by:     authUser.id,
        title:          title.trim(),
        description:    description.trim() || null,
        discount_label: discountLabel.trim() || null,
        post_to_feed:   postToFeed,
      })
      .select('id, title, description, discount_label, post_to_feed, expires_at, created_at')
      .single()

    if (!error && data) {
      setPromos((prev) => [data as Promotion, ...prev])
      setTitle('')
      setDescription('')
      setDiscountLabel('')
      setPostToFeed(false)
    }
    setSaving(false)
  }

  const handleDelete = (id: string, promoTitle: string) => {
    platformConfirm(
      `Delete "${promoTitle}"?`,
      'This promotion will be removed immediately.',
      async () => {
        await supabase.from('venue_promotions').delete().eq('id', id)
        setPromos((prev) => prev.filter((p) => p.id !== id))
      },
      { confirmText: 'Delete', destructive: true }
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Promotions</Text>
        {promos.length > 0 && <Text style={styles.count}>{promos.length} active</Text>}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 600, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
      >
        <Text style={styles.hint}>
          Promotions appear on your venue page and in your followers' feeds. Great for happy hours, events, and deals.
        </Text>

        {/* Existing promos */}
        {!loading && promos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACTIVE PROMOTIONS</Text>
            {promos.map((p) => (
              <View key={p.id} style={styles.promoCard}>
                <View style={styles.promoTop}>
                  <Text style={styles.promoTitle}>{p.title}</Text>
                  <TouchableOpacity onPress={() => handleDelete(p.id, p.title)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {p.discount_label && (
                  <View style={styles.discountPill}>
                    <Text style={styles.discountText}>{p.discount_label}</Text>
                  </View>
                )}
                {p.description && <Text style={styles.promoDesc}>{p.description}</Text>}
                {p.post_to_feed && (
                  <View style={styles.feedBadge}>
                    <Text style={styles.feedBadgeText}>📡 Posted to feed</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {loading && <ActivityIndicator color="#29B6F6" style={{ marginTop: 40 }} />}

        {/* Create new */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CREATE PROMOTION</Text>

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Happy Hour — $5 cocktails 5–8pm"
            placeholderTextColor="#4A6580"
            maxLength={80}
          />

          <Text style={styles.label}>Discount / Deal label (optional)</Text>
          <TextInput
            style={styles.input}
            value={discountLabel}
            onChangeText={setDiscountLabel}
            placeholder="e.g. 30% off, Buy 1 Get 1, Free entry before 10pm"
            placeholderTextColor="#4A6580"
            maxLength={50}
          />

          <Text style={styles.label}>Details (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Add more context about the promotion..."
            placeholderTextColor="#4A6580"
            multiline
            maxLength={400}
          />

          <View style={styles.feedRow}>
            <View style={styles.feedRowText}>
              <Text style={styles.feedLabel}>Post to universal feed</Text>
              <Text style={styles.feedSub}>Visible to all HereNow users, not just your followers</Text>
            </View>
            <Switch
              value={postToFeed}
              onValueChange={setPostToFeed}
              trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
              thumbColor="#f8fafc"
            />
          </View>

          <TouchableOpacity
            style={[styles.createBtn, (!title.trim() || saving) && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={!title.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color="#050A15" size="small" />
              : <Text style={styles.createBtnText}>+ Post Promotion</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  backBtn:  { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title:    { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  count:    { fontSize: 13, color: '#7A93AC' },
  scroll:   { flex: 1 },
  content:  { padding: 16, gap: 20, paddingBottom: 60 },
  hint:     { fontSize: 13, color: '#7A93AC', lineHeight: 19 },
  section:  { gap: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#7A93AC',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  promoCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 8,
  },
  promoTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  promoTitle: { fontSize: 15, fontWeight: '700', color: '#f8fafc', flex: 1 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14, color: '#7A93AC' },
  promoDesc: { fontSize: 13, color: '#8EADC7', lineHeight: 18 },
  discountPill: {
    backgroundColor: '#22c55e18', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#22c55e30',
  },
  discountText: { fontSize: 12, fontWeight: '700', color: '#22c55e' },
  feedBadge: {
    backgroundColor: '#29B6F610', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#29B6F630',
  },
  feedBadgeText: { fontSize: 11, color: '#29B6F6', fontWeight: '600' },
  label: {
    fontSize: 11, fontWeight: '700', color: '#8EADC7',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  feedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  feedRowText: { flex: 1, gap: 2 },
  feedLabel: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  feedSub:   { fontSize: 12, color: '#7A93AC' },
  createBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { fontSize: 15, fontWeight: '800', color: '#050A15' },
})
