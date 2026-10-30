import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, RefreshControl, Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import BackButton from '@/components/BackButton'
import DateTimeField, { formatDateTime } from '@/components/DateTimeField'
import {
  searchOrganizations, fetchVenuePartners, grantPartner, revokePartner,
  type OrgResult, type VenuePartner,
} from '@/lib/partners'
import { partnerStatus, sortPartners, partnerWindowError, PARTNER_STATUS_LABEL } from '@/lib/partnerStatus'

// A venue's partners (Jacob, Oct 29): make an organization a partner for a
// night or a date range and choose what it may do while that lasts.
export default function VenuePartnersScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [venue, setVenue] = useState<{ id: string; name: string } | null>(null)
  const [partners, setPartners] = useState<VenuePartner[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // New partner form
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OrgResult[]>([])
  const [org, setOrg] = useState<OrgResult | null>(null)
  const [label, setLabel] = useState('')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [endsAt, setEndsAt] = useState<Date | null>(null)
  const [canBroadcast, setCanBroadcast] = useState(true)
  const [canHost, setCanHost] = useState(true)
  const [canViewStats, setCanViewStats] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }
    const { data: zone, error } = await supabase
      .from('zones').select('id, name').eq('owner_id', user.id).maybeSingle()
    if (error) console.warn('[partners] venue lookup failed:', error.message)
    setVenue(zone ?? null)
    if (zone) setPartners(await fetchVenuePartners(zone.id))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Search as the venue types, a beat after the last keystroke.
  useEffect(() => {
    if (org) return
    let cancelled = false
    const t = setTimeout(() => {
      searchOrganizations(query).then((r) => { if (!cancelled) setResults(r) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, org])

  const handleAdd = async () => {
    if (!venue || !org) { showToast('Pick an organization first.', 'error'); return }
    const windowError = partnerWindowError(startsAt, endsAt)
    if (windowError) { showToast(windowError, 'error'); return }
    if (!canBroadcast && !canHost && !canViewStats) { showToast('Allow at least one thing.', 'error'); return }
    setSaving(true)
    const res = await grantPartner({
      zoneId: venue.id, venueName: venue.name, org, label,
      canBroadcast, canHost, canViewStats, startsAt: startsAt!, endsAt: endsAt!,
    })
    setSaving(false)
    if (!res.ok) { showToast(res.message ?? 'Could not add that partner.', 'error'); return }
    showToast(`${org.name} is your partner. They've been notified.`, 'success')
    setOrg(null); setQuery(''); setLabel(''); setStartsAt(null); setEndsAt(null)
    setCanBroadcast(true); setCanHost(true); setCanViewStats(true)
    setPartners(await fetchVenuePartners(venue.id))
  }

  const handleRevoke = (p: VenuePartner) => {
    platformConfirm(
      `End ${p.organizations?.name ?? 'this'} partnership now?`,
      'They lose broadcast, hosting and stats access right away. Contests and events they already made stay up; you can still hide them.',
      async () => {
        const ok = await revokePartner(p.id)
        if (!ok) { showToast('Could not end it. Try again.', 'error'); return }
        setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, revoked_at: new Date().toISOString() } : x)))
      },
      { confirmText: 'End partnership', destructive: true },
    )
  }

  const perms = (p: VenuePartner) => [
    p.can_broadcast && 'Broadcast',
    p.can_host && 'Contests & events',
    p.can_view_stats && 'Stats',
  ].filter(Boolean).join(' · ')

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <Text style={styles.title}>Partners</Text>
      </View>

      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.content, webCenter]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
      >
        <Text style={styles.hint}>
          Make a brand or organization your partner for a night or a date range, like a sponsor running an activation.
          While it's live they can do what you allow below. You can end it any time.
        </Text>

        {loading ? <ActivityIndicator color="#29B6F6" style={{ marginTop: 30 }} /> : !venue ? (
          <Text style={styles.hint}>Set up your venue first.</Text>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ADD A PARTNER</Text>

              {org ? (
                <View style={styles.pickedOrg}>
                  <Ionicons name="business" size={18} color="#29B6F6" />
                  <Text style={styles.pickedOrgName}>{org.name}</Text>
                  <TouchableOpacity onPress={() => { setOrg(null); setQuery('') }} hitSlop={10}>
                    <Text style={styles.change}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search organizations, e.g. Monster"
                    placeholderTextColor="#4A6580"
                    autoCorrect={false}
                  />
                  {results.map((r) => (
                    <TouchableOpacity key={r.id} style={styles.result} onPress={() => { setOrg(r); setResults([]) }}>
                      <Text style={styles.resultName}>{r.name}</Text>
                      {r.category ? <Text style={styles.resultCat}>{r.category}</Text> : null}
                    </TouchableOpacity>
                  ))}
                  {query.trim().length >= 2 && results.length === 0 && (
                    <Text style={styles.small}>
                      No organization by that name yet. They create one in the app (Profile, then Organizations), then you can add them here.
                    </Text>
                  )}
                </>
              )}

              <Text style={styles.label}>What is it? (optional)</Text>
              <TextInput
                style={styles.input}
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Bull Night"
                placeholderTextColor="#4A6580"
                maxLength={80}
              />

              <Text style={styles.label}>Starts</Text>
              <DateTimeField value={startsAt} onChange={setStartsAt} placeholder="Tap to pick when it starts" />
              <Text style={styles.label}>Ends</Text>
              <DateTimeField value={endsAt} onChange={setEndsAt} placeholder="Tap to pick when it ends" />

              <Text style={styles.label}>While it's live, they can</Text>
              <Permission
                title="Broadcast to your guests"
                sub="Posts that people checked in here see in Updates and the Pulse. Gone when they leave."
                value={canBroadcast} onChange={setCanBroadcast}
              />
              <Permission
                title="Run contests and add events here"
                sub="No approval step: adding them as a partner is the approval. They can set these up before the start."
                value={canHost} onChange={setCanHost}
              />
              <Permission
                title="See the night's numbers"
                sub="Totals only: check-ins, guests, broadcast reach, contest entries. Never who."
                value={canViewStats} onChange={setCanViewStats}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, (!org || saving) && styles.disabled]}
                onPress={handleAdd}
                disabled={!org || saving}
              >
                {saving ? <ActivityIndicator color="#050A15" size="small" /> : <Text style={styles.primaryBtnText}>Add partner</Text>}
              </TouchableOpacity>
            </View>

            {partners.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>YOUR PARTNERS</Text>
                {sortPartners(partners).map((p) => {
                  const status = partnerStatus(p)
                  return (
                    <View key={p.id} style={[styles.card, status === 'live' && styles.cardLive]}>
                      <View style={styles.cardTop}>
                        <Text style={styles.cardName}>{p.organizations?.name ?? 'Organization'}</Text>
                        <View style={[styles.pill, status === 'live' ? styles.pillLive : status === 'upcoming' ? styles.pillSoon : styles.pillPast]}>
                          <Text style={[styles.pillText, status === 'live' ? styles.pillLiveText : status === 'upcoming' ? styles.pillSoonText : styles.pillPastText]}>
                            {PARTNER_STATUS_LABEL[status]}
                          </Text>
                        </View>
                      </View>
                      {p.label ? <Text style={styles.cardLabel}>{p.label}</Text> : null}
                      <Text style={styles.small}>{formatDateTime(new Date(p.starts_at))} to {formatDateTime(new Date(p.ends_at))}</Text>
                      <Text style={styles.small}>{perms(p) || 'Nothing allowed'}</Text>
                      <View style={styles.cardActions}>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/partner/${p.id}` as any)}>
                          <Text style={styles.secondaryBtnText}>Open</Text>
                        </TouchableOpacity>
                        {(status === 'live' || status === 'upcoming') && (
                          <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleRevoke(p)}>
                            <Text style={[styles.secondaryBtnText, { color: '#ef4444' }]}>End now</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Permission({ title, sub, value, onChange }: {
  title: string; sub: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <View style={styles.permRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.small}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#1A2E4A', true: '#29B6F6' }} thumbColor="#f8fafc" />
    </View>
  )
}

const webCenter = Platform.select({
  web: { maxWidth: 600, alignSelf: 'center' as const, width: '100%' as any } as any,
  default: {},
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title:   { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 60 },
  hint:    { fontSize: 13, color: '#7A93AC', lineHeight: 19 },
  small:   { fontSize: 12, color: '#7A93AC', lineHeight: 17 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#7A93AC', textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 11, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  result: {
    backgroundColor: '#07101F', borderRadius: 10, padding: 12, minHeight: 44,
    borderWidth: 1, borderColor: '#1A2E4A', flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  resultName: { fontSize: 14, fontWeight: '700', color: '#f8fafc', flex: 1 },
  resultCat:  { fontSize: 11, color: '#7A93AC', textTransform: 'capitalize' },
  pickedOrg: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#29B6F615', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#29B6F6',
  },
  pickedOrgName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  change: { fontSize: 13, fontWeight: '700', color: '#29B6F6' },
  permRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  permTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  primaryBtn: { backgroundColor: '#29B6F6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#050A15' },
  disabled: { opacity: 0.4 },
  card: { backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: '#1A2E4A' },
  cardLive: { borderColor: '#22c55e66' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#D0E8F5' },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  pillLive: { backgroundColor: '#22c55e18', borderColor: '#22c55e40' },
  pillSoon: { backgroundColor: '#29B6F618', borderColor: '#29B6F640' },
  pillPast: { backgroundColor: '#7A93AC18', borderColor: '#7A93AC40' },
  pillText: { fontSize: 11, fontWeight: '800' },
  pillLiveText: { color: '#22c55e' },
  pillSoonText: { color: '#29B6F6' },
  pillPastText: { color: '#7A93AC' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  secondaryBtn: {
    paddingHorizontal: 14, minHeight: 40, borderRadius: 10, justifyContent: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: '#29B6F6' },
})
