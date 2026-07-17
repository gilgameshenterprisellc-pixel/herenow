import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, RefreshControl, Switch,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import BackButton from '@/components/BackButton'

interface Promotion {
  id: string
  title: string
  description: string | null
  discount_label: string | null
  post_to_feed: boolean
  expires_at: string | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

type PickerTarget = 'starts' | 'ends' | null

function formatDateTime(date: Date): string {
  return date.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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
  const [audience, setAudience]     = useState<'all' | 'subscribers'>('all')

  // Time window state
  const [hasTimeWindow, setHasTimeWindow] = useState(false)
  const [startsAt, setStartsAt]         = useState<Date | null>(null)
  const [endsAt, setEndsAt]             = useState<Date | null>(null)
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null)
  const [iosPendingDate, setIosPendingDate]           = useState<Date>(new Date())
  const [androidStep, setAndroidStep]                 = useState<'date' | 'time'>('date')
  const [androidPendingDate, setAndroidPendingDate]   = useState<Date>(new Date())

  const openPicker = (target: PickerTarget) => {
    const now = new Date()
    const current = target === 'ends'
      ? (endsAt ?? new Date(now.getTime() + 2 * 60 * 60 * 1000))
      : (startsAt ?? new Date(now.getTime() + 60 * 60 * 1000))
    setPickerTarget(target)
    setIosPendingDate(current)
    setAndroidPendingDate(current)
    setAndroidStep('date')
  }

  const onPickerChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (_event.type !== 'set' || !selected) {
        setPickerTarget(null)
        setAndroidStep('date')
        return
      }
      if (androidStep === 'date') {
        setAndroidPendingDate(selected)
        setAndroidStep('time')
      } else {
        const combined = new Date(androidPendingDate)
        combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
        if (pickerTarget === 'starts') setStartsAt(combined)
        else setEndsAt(combined)
        setPickerTarget(null)
        setAndroidStep('date')
      }
    } else {
      // iOS: update as user spins
      if (selected) setIosPendingDate(selected)
    }
  }

  const confirmIosPicker = () => {
    if (pickerTarget === 'starts') setStartsAt(iosPendingDate)
    else setEndsAt(iosPendingDate)
    setPickerTarget(null)
  }

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: zone } = await supabase
      .from('zones').select('id').eq('owner_id', user.id).maybeSingle()

    if (!zone) { setLoading(false); setRefreshing(false); return }
    setZoneId(zone.id)

    const { data } = await supabase
      .from('venue_promotions')
      .select('id, title, description, discount_label, post_to_feed, expires_at, starts_at, ends_at, created_at')
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
        audience,
        starts_at:      hasTimeWindow && startsAt ? startsAt.toISOString() : null,
        ends_at:        hasTimeWindow && endsAt   ? endsAt.toISOString()   : null,
      })
      .select('id, title, description, discount_label, post_to_feed, expires_at, starts_at, ends_at, created_at')
      .single()

    if (!error && data) {
      setPromos((prev) => [data as Promotion, ...prev])
      setTitle('')
      setDescription('')
      setDiscountLabel('')
      setPostToFeed(false)
      setHasTimeWindow(false)
      setStartsAt(null)
      setEndsAt(null)
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
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <Text style={styles.title}>Promotions</Text>
        {promos.length > 0 && <Text style={styles.count}>{promos.length} active</Text>}
      </View>

      <ScrollView
        keyboardDismissMode="on-drag"
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
                {(p.starts_at || p.ends_at) && (
                  <View style={styles.windowBadge}>
                    <Text style={styles.windowText}>
                      🕐{' '}
                      {p.starts_at ? formatDateTime(new Date(p.starts_at)) : 'Now'}
                      {p.ends_at ? ` → ${formatDateTime(new Date(p.ends_at))}` : ' (no end)'}
                    </Text>
                  </View>
                )}
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

          {/* Time window toggle */}
          <View style={styles.feedRow}>
            <View style={styles.feedRowText}>
              <Text style={styles.feedLabel}>Schedule time window</Text>
              <Text style={styles.feedSub}>Only visible during a specific date/time range</Text>
            </View>
            <Switch
              value={hasTimeWindow}
              onValueChange={(v) => {
                setHasTimeWindow(v)
                if (!v) { setStartsAt(null); setEndsAt(null) }
              }}
              trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
              thumbColor="#f8fafc"
            />
          </View>

          {hasTimeWindow && (
            <View style={styles.windowSection}>
              <Text style={styles.label}>Starts</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => openPicker('starts')}>
                <Text style={styles.dateBtnText}>
                  {startsAt ? formatDateTime(startsAt) : 'Tap to set start time'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.label}>Ends (optional)</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => openPicker('ends')}>
                <Text style={styles.dateBtnText}>
                  {endsAt ? formatDateTime(endsAt) : 'Tap to set end time'}
                </Text>
              </TouchableOpacity>
              {endsAt && (
                <TouchableOpacity onPress={() => setEndsAt(null)}>
                  <Text style={styles.clearDate}>Remove end time</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* DateTimePicker */}
          {pickerTarget !== null && (
            Platform.OS === 'ios' ? (
              <View style={styles.iosPickerWrap}>
                <View style={styles.iosPickerHeader}>
                  <TouchableOpacity onPress={() => setPickerTarget(null)}>
                    <Text style={styles.iosPickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmIosPicker}>
                    <Text style={styles.iosPickerConfirm}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={iosPendingDate}
                  mode="datetime"
                  display="spinner"
                  onChange={onPickerChange}
                  minimumDate={new Date()}
                  textColor="#f8fafc"
                  themeVariant="dark"
                />
              </View>
            ) : (
              <DateTimePicker
                value={androidPendingDate}
                mode={androidStep}
                display="default"
                onChange={onPickerChange}
                minimumDate={new Date()}
              />
            )
          )}

          {/* Audience — who among your followers sees this */}
          <View style={styles.audienceWrap}>
            <Text style={styles.feedLabel}>Who sees this?</Text>
            <View style={styles.audienceRow}>
              <TouchableOpacity
                style={[styles.audienceChip, audience === 'all' && styles.audienceChipOn]}
                onPress={() => setAudience('all')}
              >
                <Text style={[styles.audienceChipText, audience === 'all' && styles.audienceChipTextOn]}>All followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.audienceChip, audience === 'subscribers' && styles.audienceChipGoldOn]}
                onPress={() => setAudience('subscribers')}
              >
                <Text style={[styles.audienceChipText, audience === 'subscribers' && styles.audienceChipTextGoldOn]}>
                  ★ Subscribers only
                </Text>
              </TouchableOpacity>
            </View>
          </View>

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
  audienceWrap: { gap: 8 },
  audienceRow: { flexDirection: 'row', gap: 8 },
  audienceChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  audienceChipOn: { borderColor: '#29B6F6', backgroundColor: '#29B6F620' },
  audienceChipGoldOn: { borderColor: '#f59e0b', backgroundColor: '#f59e0b20' },
  audienceChipText: { fontSize: 13, fontWeight: '700', color: '#7A93AC' },
  audienceChipTextOn: { color: '#29B6F6' },
  audienceChipTextGoldOn: { color: '#f59e0b' },
  feedSub:   { fontSize: 12, color: '#7A93AC' },
  createBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { fontSize: 15, fontWeight: '800', color: '#050A15' },
  windowBadge: {
    backgroundColor: '#a855f718', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#a855f730',
  },
  windowText: { fontSize: 12, fontWeight: '600', color: '#c084fc' },
  windowSection: { gap: 8, paddingTop: 4 },
  dateBtn: {
    backgroundColor: '#0D1B2E', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#1A2E4A',
  },
  dateBtnText: { fontSize: 14, color: '#29B6F6' },
  clearDate: { fontSize: 12, color: '#7A93AC', textDecorationLine: 'underline', paddingLeft: 2 },
  iosPickerWrap: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A', overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1A2E4A',
  },
  iosPickerCancel: { fontSize: 14, color: '#7A93AC' },
  iosPickerConfirm: { fontSize: 14, fontWeight: '700', color: '#29B6F6' },
})
