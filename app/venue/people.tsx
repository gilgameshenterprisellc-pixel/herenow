import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getActivePeople } from '@/lib/sessions'
import { useToast } from '@/contexts/ToastContext'
import BackButton from '@/components/BackButton'
import type { ActivePerson } from '@/lib/sessions'

interface Promotion {
  id: string
  title: string
  discount_label: string | null
}

interface RedemptionMap {
  [promoId: string]: Set<string> // promoId → Set of user_ids who redeemed
}

const SOCIAL_MODE_COLORS: Record<string, string> = {
  dating:      '#f43f5e',
  friends:     '#22c55e',
  networking:  '#3b82f6',
  just_vibes:  '#a855f7',
}

const SOCIAL_MODE_LABELS: Record<string, string> = {
  dating:     '💘 Dating',
  friends:    '🤝 Friends',
  networking: '💼 Networking',
  just_vibes: '✌️ Just Vibes',
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just arrived'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export default function VenuePeopleScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [zoneId, setZoneId]         = useState<string | null>(null)
  const [ownerId, setOwnerId]       = useState<string | null>(null)
  const [people, setPeople]         = useState<ActivePerson[]>([])
  const [promos, setPromos]         = useState<Promotion[]>([])
  const [redemptions, setRedemptions] = useState<RedemptionMap>({})
  const [redeeming, setRedeeming]   = useState<string | null>(null) // composite key

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }
    setOwnerId(user.id)

    const { data: zone } = await supabase
      .from('zones').select('id').eq('owner_id', user.id).maybeSingle()
    if (!zone) { setLoading(false); setRefreshing(false); return }
    setZoneId(zone.id)

    const [livePeople, promosRes, redemptionsRes] = await Promise.all([
      getActivePeople(zone.id),
      supabase.from('venue_promotions')
        .select('id, title, discount_label')
        .eq('zone_id', zone.id)
        .order('created_at', { ascending: false }),
      supabase.from('promotion_redemptions')
        .select('promotion_id, user_id')
        .eq('zone_id', zone.id),
    ])

    setPeople(livePeople)
    setPromos((promosRes.data ?? []) as Promotion[])

    const map: RedemptionMap = {}
    for (const r of (redemptionsRes.data ?? []) as { promotion_id: string; user_id: string | null }[]) {
      if (!r.user_id) continue
      if (!map[r.promotion_id]) map[r.promotion_id] = new Set()
      map[r.promotion_id].add(r.user_id)
    }
    setRedemptions(map)

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const isRedeemed = (promoId: string, userId: string): boolean =>
    redemptions[promoId]?.has(userId) ?? false

  const toggleRedemption = async (promoId: string, userId: string, personName: string, promoTitle: string) => {
    if (!zoneId || !ownerId) return
    const key = `${promoId}:${userId}`
    setRedeeming(key)

    const already = isRedeemed(promoId, userId)

    if (already) {
      // Undo redemption
      const { error } = await supabase
        .from('promotion_redemptions')
        .delete()
        .eq('promotion_id', promoId)
        .eq('user_id', userId)

      if (error) {
        showToast('Failed to undo. Try again.', 'error')
      } else {
        setRedemptions((prev) => {
          const next = { ...prev }
          next[promoId] = new Set(prev[promoId])
          next[promoId].delete(userId)
          return next
        })
        showToast(`${personName}'s "${promoTitle}" redemption removed.`, 'info')
      }
    } else {
      // Mark as redeemed
      const { error } = await supabase
        .from('promotion_redemptions')
        .insert({ promotion_id: promoId, zone_id: zoneId, user_id: userId, redeemed_by: ownerId })

      if (error) {
        showToast('Failed to mark redeemed. Try again.', 'error')
      } else {
        setRedemptions((prev) => {
          const next = { ...prev }
          next[promoId] = new Set(prev[promoId])
          next[promoId].add(userId)
          return next
        })
        showToast(`${personName} redeemed "${promoTitle}" ✓`, 'success')
      }
    }

    setRedeeming(null)
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
        <View style={styles.headerText}>
          <Text style={styles.title}>Live Now</Text>
          <Text style={styles.subtitle}>{people.length} {people.length === 1 ? 'guest' : 'guests'} checked in</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {promos.length > 0 && (
        <View style={styles.promosBar}>
          <Text style={styles.promosBarLabel}>ACTIVE PROMOS</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promosBarScroll}>
            {promos.map((p) => (
              <View key={p.id} style={styles.promoChip}>
                <Text style={styles.promoChipText}>{p.discount_label || p.title}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 600, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
      >
        {people.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏙️</Text>
            <Text style={styles.emptyTitle}>Nobody checked in yet</Text>
            <Text style={styles.emptySub}>Pull to refresh — guests appear here when they check in.</Text>
          </View>
        ) : (
          people.map((person) => {
            const modeColor = SOCIAL_MODE_COLORS[person.social_mode] ?? '#29B6F6'
            return (
              <View key={person.session_id} style={styles.personCard}>
                {/* Person header */}
                <View style={styles.personTop}>
                  <View style={[styles.avatar, { borderColor: modeColor + '55' }]}>
                    <Text style={styles.avatarInitial}>
                      {person.display_name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{person.display_name}</Text>
                    <View style={styles.personMeta}>
                      <Text style={[styles.personMode, { color: modeColor }]}>
                        {SOCIAL_MODE_LABELS[person.social_mode] ?? person.social_mode}
                      </Text>
                      <Text style={styles.personTime}>{timeAgo(person.checked_in_at)}</Text>
                    </View>
                  </View>
                </View>

                {/* Promo redemption controls */}
                {promos.length > 0 && (
                  <View style={styles.promoSection}>
                    <Text style={styles.promoSectionLabel}>PROMO REDEMPTIONS</Text>
                    <View style={styles.promoButtons}>
                      {promos.map((promo) => {
                        const redeemed = isRedeemed(promo.id, person.user_id)
                        const key = `${promo.id}:${person.user_id}`
                        const busy = redeeming === key
                        return (
                          <TouchableOpacity
                            key={promo.id}
                            style={[styles.redeemBtn, redeemed && styles.redeemBtnDone]}
                            onPress={() => toggleRedemption(promo.id, person.user_id, person.display_name, promo.title)}
                            disabled={busy}
                            activeOpacity={0.75}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color={redeemed ? '#050A15' : '#29B6F6'} />
                            ) : (
                              <>
                                <Text style={[styles.redeemBtnIcon, redeemed && styles.redeemBtnIconDone]}>
                                  {redeemed ? '✓' : '🏷️'}
                                </Text>
                                <Text style={[styles.redeemBtnText, redeemed && styles.redeemBtnTextDone]} numberOfLines={1}>
                                  {promo.discount_label || promo.title}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )}
              </View>
            )
          })
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
  backBtn:    { padding: 8 },
  backText:   { fontSize: 22, color: '#f8fafc' },
  headerText: { flex: 1 },
  title:      { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  subtitle:   { fontSize: 12, color: '#7A93AC', marginTop: 1 },
  refreshBtn: { padding: 8 },
  refreshText: { fontSize: 20, color: '#29B6F6' },

  promosBar: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 6,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  promosBarLabel: { fontSize: 10, fontWeight: '700', color: '#4A6580', letterSpacing: 1 },
  promosBarScroll: { gap: 8 },
  promoChip: {
    backgroundColor: '#22c55e18', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#22c55e30',
  },
  promoChipText: { fontSize: 11, color: '#22c55e', fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { padding: 12, gap: 10, paddingBottom: 40 },

  personCard: {
    backgroundColor: '#0D1B2E', borderRadius: 16,
    borderWidth: 1, borderColor: '#1A2E4A', overflow: 'hidden',
  },
  personTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0A1628', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  personInfo: { flex: 1, gap: 3 },
  personName: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  personMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personMode: { fontSize: 11, fontWeight: '600' },
  personTime: { fontSize: 11, color: '#4A6580' },

  promoSection: {
    borderTopWidth: 1, borderTopColor: '#1A2E4A',
    padding: 12, gap: 8,
  },
  promoSectionLabel: {
    fontSize: 10, fontWeight: '700', color: '#4A6580', letterSpacing: 0.8,
  },
  promoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  redeemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0A1628', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1A2E4A',
    minWidth: 80,
  },
  redeemBtnDone: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  redeemBtnIcon: { fontSize: 13 },
  redeemBtnIconDone: { color: '#050A15' },
  redeemBtnText: { fontSize: 12, fontWeight: '600', color: '#8EADC7', flex: 1 },
  redeemBtnTextDone: { color: '#050A15', fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  emptySub:   { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
})
