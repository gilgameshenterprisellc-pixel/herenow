import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import {
  fetchAllVenuePromotions, createPromotion, deletePromotion,
  togglePromotion, type Promotion,
} from '@/lib/promotions'

function promoStatus(p: Promotion): { label: string; color: string } {
  const now = new Date()
  if (!p.is_active) return { label: 'Paused', color: '#4A6580' }
  if (new Date(p.starts_at) > now) return { label: 'Scheduled', color: '#f59e0b' }
  if (p.ends_at && new Date(p.ends_at) < now) return { label: 'Expired', color: '#ef4444' }
  return { label: 'Active', color: '#22c55e' }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function VenuePromotions() {
  const insets = useSafeAreaInsets()
  const [zoneId, setZoneId]           = useState<string | null>(null)
  const [promotions, setPromotions]   = useState<Promotion[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [showForm, setShowForm]       = useState(false)

  // Form state
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt]       = useState('')
  const [endsAt, setEndsAt]           = useState('')
  const [saving, setSaving]           = useState(false)

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
      const promos = await fetchAllVenuePromotions(id)
      setPromotions(promos)
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Give your promotion a title.')
      return
    }
    if (!zoneId) return

    // Validate optional date inputs
    let parsedStartsAt: string | undefined
    let parsedEndsAt: string | undefined

    if (startsAt.trim()) {
      const d = new Date(startsAt.trim())
      if (isNaN(d.getTime())) {
        Alert.alert('Invalid date', 'Use format: YYYY-MM-DD HH:MM')
        return
      }
      parsedStartsAt = d.toISOString()
    }
    if (endsAt.trim()) {
      const d = new Date(endsAt.trim())
      if (isNaN(d.getTime())) {
        Alert.alert('Invalid date', 'Use format: YYYY-MM-DD HH:MM')
        return
      }
      parsedEndsAt = d.toISOString()
    }

    setSaving(true)
    await createPromotion({
      zoneId,
      title: title.trim(),
      description: description.trim() || undefined,
      startsAt: parsedStartsAt,
      endsAt: parsedEndsAt,
    })

    setTitle('')
    setDescription('')
    setStartsAt('')
    setEndsAt('')
    setShowForm(false)
    setSaving(false)
    load()
  }

  const handleDelete = (promo: Promotion) => {
    Alert.alert(
      'Delete promotion?',
      `"${promo.title}" will be removed immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePromotion(promo.id)
            load()
          },
        },
      ]
    )
  }

  const handleToggle = async (promo: Promotion) => {
    await togglePromotion(promo.id, !promo.is_active)
    load()
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
        <Text style={styles.title}>Promotions</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowForm(!showForm)}
        >
          <Text style={styles.addBtnText}>{showForm ? 'Cancel' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
      >
        {/* Create form */}
        {showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>New Promotion</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Happy Hour 🍺"
                placeholderTextColor="#4A6580"
                maxLength={80}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Details, conditions, what's included..."
                placeholderTextColor="#4A6580"
                multiline
                maxLength={200}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Starts At</Text>
                <TextInput
                  style={styles.input}
                  value={startsAt}
                  onChangeText={setStartsAt}
                  placeholder="Now (leave blank)"
                  placeholderTextColor="#4A6580"
                />
              </View>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Ends At</Text>
                <TextInput
                  style={styles.input}
                  value={endsAt}
                  onChangeText={setEndsAt}
                  placeholder="No expiry (leave blank)"
                  placeholderTextColor="#4A6580"
                />
              </View>
            </View>
            <Text style={styles.dateHint}>Format: 2026-07-04 21:00</Text>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#050A15" size="small" />
                : <Text style={styles.saveBtnText}>Create Promotion</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Promotions list */}
        {promotions.length === 0 && !showForm && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏷️</Text>
            <Text style={styles.emptyTitle}>No promotions yet</Text>
            <Text style={styles.emptySub}>
              Create deals and specials that your checked-in guests will see in the Deals tab.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowForm(true)}>
              <Text style={styles.emptyBtnText}>Create First Promotion</Text>
            </TouchableOpacity>
          </View>
        )}

        {promotions.map((promo) => {
          const status = promoStatus(promo)
          return (
            <View key={promo.id} style={styles.promoCard}>
              <View style={styles.promoTop}>
                <View style={[styles.statusPill, { borderColor: status.color + '44', backgroundColor: status.color + '12' }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
                <View style={styles.promoActions}>
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => handleToggle(promo)}
                  >
                    <Text style={styles.toggleBtnText}>
                      {promo.is_active ? 'Pause' : 'Resume'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(promo)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.promoTitle}>{promo.title}</Text>
              {promo.description && (
                <Text style={styles.promoDesc}>{promo.description}</Text>
              )}

              <View style={styles.promoMeta}>
                <Text style={styles.promoMetaText}>
                  Starts: {formatDateTime(promo.starts_at)}
                </Text>
                {promo.ends_at && (
                  <Text style={styles.promoMetaText}>
                    Ends: {formatDateTime(promo.ends_at)}
                  </Text>
                )}
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn:  { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title:    { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  addBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addBtnText: { color: '#050A15', fontWeight: '800', fontSize: 13 },
  scroll:   { flex: 1 },
  content:  { padding: 16, gap: 12, paddingBottom: 40 },

  form: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#29B6F630',
    gap: 14,
  },
  formTitle: { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  field:    { gap: 6 },
  label:    { fontSize: 11, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#0A1628',
    borderRadius: 10,
    padding: 12,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  row:      { flexDirection: 'row', gap: 10 },
  flex:     { flex: 1 },
  dateHint: { fontSize: 11, color: '#4A6580', marginTop: -8 },
  saveBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:     { color: '#050A15', fontWeight: '800', fontSize: 15 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub:   { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18, paddingHorizontal: 24 },
  emptyBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: '#050A15', fontWeight: '800', fontSize: 14 },

  promoCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 8,
  },
  promoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText:  { fontSize: 11, fontWeight: '800' },
  promoActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleBtn: {
    backgroundColor: '#1A2E4A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  toggleBtnText: { fontSize: 12, fontWeight: '700', color: '#8EADC7' },
  deleteBtn: { padding: 6 },
  deleteBtnText: { fontSize: 14, color: '#ef4444' },
  promoTitle: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  promoDesc:  { fontSize: 13, color: '#7A93AC', lineHeight: 17 },
  promoMeta:  { flexDirection: 'row', gap: 16, marginTop: 2 },
  promoMetaText: { fontSize: 11, color: '#4A6580' },
})
