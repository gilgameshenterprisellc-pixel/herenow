import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingVenue {
  id: string
  display_name: string
  username: string | null
  created_at: string
  venue_address: string | null
  venue_city:    string | null
  venue_state:   string | null
  venue_zip:     string | null
  venue_lat:     number | null
  venue_lng:     number | null
  venue_type:    string | null
  existing_zone: {
    id: string
    name: string
    type: string
    center_lat: number | null
    center_lng: number | null
    radius_meters: number | null
  } | null
}

interface LiveVenue {
  id: string
  display_name: string
  username: string | null
  venue_address: string | null
  venue_city:    string | null
  venue_state:   string | null
  venue_type:    string | null
  zone: {
    id:            string
    name:          string
    type:          string
    center_lat:    number | null
    center_lng:    number | null
    radius_meters: number | null
    is_active:     boolean
  } | null
}

interface GeofenceForm {
  zoneName: string
  zoneType: string
  lat: string
  lng: string
  radius: string
}

const ZONE_TYPES = ['bar', 'club', 'restaurant', 'cafe', 'venue', 'park', 'other']

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminVenues() {
  const insets = useSafeAreaInsets()
  const [tab, setTab]               = useState<'pending' | 'live'>('pending')
  const [pending, setPending]       = useState<PendingVenue[]>([])
  const [live, setLive]             = useState<LiveVenue[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [forms, setForms]           = useState<Record<string, GeofenceForm>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [pendingRes, approvedRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, username, created_at, venue_address, venue_city, venue_state, venue_zip, venue_lat, venue_lng, venue_type')
        .eq('venue_status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name, username, venue_address, venue_city, venue_state, venue_type')
        .eq('venue_status', 'approved')
        .order('display_name', { ascending: true }),
    ])

    const pendingProfiles  = pendingRes.data  ?? []
    const approvedProfiles = approvedRes.data ?? []

    const allOwnerIds = [
      ...pendingProfiles.map((p: any) => p.id),
      ...approvedProfiles.map((p: any) => p.id),
    ]

    const { data: zones } = allOwnerIds.length > 0
      ? await supabase
          .from('zones')
          .select('id, name, type, center_lat, center_lng, radius_meters, is_active, owner_id')
          .in('owner_id', allOwnerIds)
      : { data: [] as any[] }

    const zoneByOwner: Record<string, any> = {}
    for (const z of zones ?? []) zoneByOwner[z.owner_id] = z

    // Pending list
    const mergedPending: PendingVenue[] = pendingProfiles.map((p: any) => ({
      id:            p.id,
      display_name:  p.display_name,
      username:      p.username ?? null,
      created_at:    p.created_at,
      venue_address: p.venue_address ?? null,
      venue_city:    p.venue_city    ?? null,
      venue_state:   p.venue_state   ?? null,
      venue_zip:     p.venue_zip     ?? null,
      venue_lat:     p.venue_lat     ?? null,
      venue_lng:     p.venue_lng     ?? null,
      venue_type:    p.venue_type    ?? null,
      existing_zone: zoneByOwner[p.id] ?? null,
    }))

    setPending(mergedPending)

    // Pre-fill pending forms
    const defaultForms: Record<string, GeofenceForm> = {}
    for (const v of mergedPending) {
      const z = v.existing_zone
      defaultForms[v.id] = {
        zoneName: z?.name ?? v.display_name,
        zoneType: z?.type ?? v.venue_type ?? 'venue',
        lat:      z?.center_lat?.toString() ?? v.venue_lat?.toString()  ?? '',
        lng:      z?.center_lng?.toString() ?? v.venue_lng?.toString()  ?? '',
        radius:   z?.radius_meters?.toString() ?? '50',
      }
    }
    setForms(defaultForms)

    // Live list
    setLive(approvedProfiles.map((p: any) => ({
      id:            p.id,
      display_name:  p.display_name,
      username:      p.username ?? null,
      venue_address: p.venue_address ?? null,
      venue_city:    p.venue_city    ?? null,
      venue_state:   p.venue_state   ?? null,
      venue_type:    p.venue_type    ?? null,
      zone:          zoneByOwner[p.id] ?? null,
    })))

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  // ── Form helpers ──────────────────────────────────────────────────────────

  const updateForm = (venueId: string, field: keyof GeofenceForm, value: string) => {
    setForms((prev) => ({ ...prev, [venueId]: { ...prev[venueId], [field]: value } }))
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  const handleApprove = async (venue: PendingVenue) => {
    const form = forms[venue.id]
    if (!form) return

    const lat    = parseFloat(form.lat)
    const lng    = parseFloat(form.lng)
    const radius = parseInt(form.radius)

    if (!form.zoneName.trim())                             { Alert.alert('Zone name required'); return }
    if (isNaN(lat)    || lat    < -90   || lat    > 90)   { Alert.alert('Invalid latitude', 'Must be −90 to 90'); return }
    if (isNaN(lng)    || lng    < -180  || lng    > 180)  { Alert.alert('Invalid longitude', 'Must be −180 to 180'); return }
    if (isNaN(radius) || radius < 10    || radius > 5000) { Alert.alert('Invalid radius', 'Must be 10–5000 m'); return }

    const doApprove = async () => {
      setSubmitting(venue.id)
      const { error } = await supabase.rpc('admin_approve_venue', {
        p_profile_id: venue.id,
        p_zone_name:  form.zoneName.trim(),
        p_zone_type:  form.zoneType,
        p_lat:        lat,
        p_lng:        lng,
        p_radius:     radius,
      })
      setSubmitting(null)
      if (error) {
        console.error('[AdminVenues] approve error:', error)
        Alert.alert('Approval failed', error.message)
      } else {
        Alert.alert('Approved ✓', `${venue.display_name} is now live.`, [
          { text: 'OK', onPress: () => { load(); setTab('live') } },
        ])
        setPending((prev) => prev.filter((v) => v.id !== venue.id))
      }
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(
        `Approve "${venue.display_name}"?\n\nZone: ${form.zoneName}\nLocation: ${lat}, ${lng}\nRadius: ${radius}m`
      )
      if (ok) doApprove()
    } else {
      Alert.alert(
        `Approve ${venue.display_name}?`,
        `Zone: ${form.zoneName}\nLocation: ${lat}, ${lng}\nRadius: ${radius}m`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Approve', onPress: doApprove },
        ]
      )
    }
  }

  // ── Deny ─────────────────────────────────────────────────────────────────

  const handleDeny = (venue: PendingVenue) => {
    const doDeny = async () => {
      setSubmitting(venue.id)
      await supabase.rpc('admin_deny_venue', { p_profile_id: venue.id })
      setSubmitting(null)
      setPending((prev) => prev.filter((v) => v.id !== venue.id))
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(
        `Deny "${venue.display_name}"?\n\nThe owner will see their application as denied.`
      )
      if (ok) doDeny()
    } else {
      Alert.alert(
        `Deny ${venue.display_name}?`,
        'The owner will see their application as denied.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Deny', style: 'destructive', onPress: doDeny },
        ]
      )
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Venues</Text>
        {pending.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{pending.length}</Text>
          </View>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'pending' && styles.tabBtnActive]}
          onPress={() => setTab('pending')}
        >
          <Text style={[styles.tabBtnText, tab === 'pending' && styles.tabBtnTextActive]}>
            Pending{pending.length > 0 ? ` (${pending.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'live' && styles.tabBtnActive]}
          onPress={() => setTab('live')}
        >
          <Text style={[styles.tabBtnText, tab === 'live' && styles.tabBtnTextActive]}>
            Live{live.length > 0 ? ` (${live.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({
            web:     { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any,
            default: {},
          }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />

        ) : tab === 'pending' ? (
          // ── PENDING TAB ────────────────────────────────────────────────────
          pending.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptySub}>No pending venue applications.</Text>
            </View>
          ) : (
            pending.map((venue) => {
              const isOpen = expanded === venue.id
              const form   = forms[venue.id] ?? { zoneName: '', zoneType: 'venue', lat: '', lng: '', radius: '50' }
              const busy   = submitting === venue.id
              return (
                <View key={venue.id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => setExpanded(isOpen ? null : venue.id)}
                  >
                    <View style={styles.cardLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.cardVenueName}>{venue.display_name}</Text>
                        {(venue.venue_lat && venue.venue_lng)
                          ? <Text style={{ fontSize: 11, color: '#22c55e' }}>● GPS ready</Text>
                          : venue.venue_address
                            ? <Text style={{ fontSize: 11, color: '#f59e0b' }}>● Address on file</Text>
                            : <Text style={{ fontSize: 11, color: '#ef4444' }}>● No address</Text>
                        }
                      </View>
                      {(venue.venue_address || venue.venue_city) && (
                        <Text style={styles.cardAddress}>
                          {[venue.venue_address, venue.venue_city, venue.venue_state, venue.venue_zip].filter(Boolean).join(', ')}
                        </Text>
                      )}
                      {venue.username   ? <Text style={styles.cardMeta}>@{venue.username}</Text>   : null}
                      {venue.venue_type ? <Text style={styles.cardMeta}>{venue.venue_type}</Text>  : null}
                    </View>
                    <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.formSection}>
                      <Text style={styles.formTitle}>Geofencing Setup</Text>
                      <Text style={styles.formHint}>
                        {(venue.venue_lat && venue.venue_lng)
                          ? '✓ Coordinates auto-filled from the venue's submission. Verify they look right, then approve.'
                          : venue.venue_address
                            ? `Address on file: ${[venue.venue_address, venue.venue_city, venue.venue_state, venue.venue_zip].filter(Boolean).join(', ')} — geocoding failed, enter coordinates manually via maps.google.com → right-click → copy lat/lng.`
                            : 'No address on file. Find coordinates at maps.google.com → right-click the venue → copy lat/lng.'
                        }
                      </Text>

                      <Text style={styles.label}>Zone Name</Text>
                      <TextInput
                        style={styles.input}
                        value={form.zoneName}
                        onChangeText={(v) => updateForm(venue.id, 'zoneName', v)}
                        placeholder="e.g. The Blue Room"
                        placeholderTextColor="#4A6580"
                      />

                      <Text style={styles.label}>Zone Type</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typePills}>
                        {ZONE_TYPES.map((t) => (
                          <TouchableOpacity
                            key={t}
                            style={[styles.typePill, form.zoneType === t && styles.typePillActive]}
                            onPress={() => updateForm(venue.id, 'zoneType', t)}
                          >
                            <Text style={[styles.typePillText, form.zoneType === t && styles.typePillTextActive]}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      <View style={styles.coordRow}>
                        <View style={styles.coordField}>
                          <Text style={styles.label}>Latitude</Text>
                          <TextInput
                            style={styles.input}
                            value={form.lat}
                            onChangeText={(v) => updateForm(venue.id, 'lat', v)}
                            placeholder="e.g. 41.8781"
                            placeholderTextColor="#4A6580"
                            keyboardType="default"
                          />
                        </View>
                        <View style={styles.coordField}>
                          <Text style={styles.label}>Longitude</Text>
                          <TextInput
                            style={styles.input}
                            value={form.lng}
                            onChangeText={(v) => updateForm(venue.id, 'lng', v)}
                            placeholder="e.g. -87.6298"
                            placeholderTextColor="#4A6580"
                            keyboardType="default"
                          />
                        </View>
                      </View>

                      <Text style={styles.label}>Check-in Radius (meters)</Text>
                      <TextInput
                        style={styles.input}
                        value={form.radius}
                        onChangeText={(v) => updateForm(venue.id, 'radius', v)}
                        placeholder="e.g. 50"
                        placeholderTextColor="#4A6580"
                        keyboardType="number-pad"
                      />
                      <Text style={styles.radiusHint}>
                        Typical: 50m for a bar/club, 100–200m for a park or outdoor venue.
                      </Text>

                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.denyBtn, busy && styles.btnDisabled]}
                          onPress={() => !busy && handleDeny(venue)}
                        >
                          <Text style={styles.denyBtnText}>✗ Deny</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.approveBtn, busy && styles.btnDisabled]}
                          onPress={() => !busy && handleApprove(venue)}
                        >
                          {busy
                            ? <ActivityIndicator color="#050A15" size="small" />
                            : <Text style={styles.approveBtnText}>✓ Approve & Go Live</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )
            })
          )

        ) : (
          // ── LIVE TAB ───────────────────────────────────────────────────────
          live.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏢</Text>
              <Text style={styles.emptyTitle}>No live venues yet</Text>
              <Text style={styles.emptySub}>Approve a pending application to get started.</Text>
            </View>
          ) : (
            live.map((venue) => (
              <View key={venue.id} style={styles.card}>
                <View style={styles.liveCardInner}>
                  <View style={styles.liveCardHeader}>
                    <View style={styles.liveDot} />
                    <Text style={styles.cardVenueName}>{venue.display_name}</Text>
                  </View>

                  {(venue.venue_address || venue.venue_city) && (
                    <Text style={styles.cardAddress}>
                      {[venue.venue_address, venue.venue_city, venue.venue_state].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  {venue.username && <Text style={styles.cardMeta}>@{venue.username}</Text>}

                  {venue.zone ? (
                    <View style={styles.zoneInfo}>
                      <View style={styles.zoneInfoRow}>
                        <Text style={styles.zoneInfoLabel}>Zone</Text>
                        <Text style={styles.zoneInfoValue}>{venue.zone.name}</Text>
                      </View>
                      <View style={styles.zoneInfoRow}>
                        <Text style={styles.zoneInfoLabel}>Type</Text>
                        <Text style={styles.zoneInfoValue}>{venue.zone.type}</Text>
                      </View>
                      <View style={styles.zoneInfoRow}>
                        <Text style={styles.zoneInfoLabel}>Radius</Text>
                        <Text style={styles.zoneInfoValue}>{venue.zone.radius_meters}m</Text>
                      </View>
                      <View style={styles.zoneInfoRow}>
                        <Text style={styles.zoneInfoLabel}>Coords</Text>
                        <Text style={styles.zoneInfoValue}>
                          {venue.zone.center_lat?.toFixed(5)}, {venue.zone.center_lng?.toFixed(5)}
                        </Text>
                      </View>
                      <View style={styles.zoneInfoRow}>
                        <Text style={styles.zoneInfoLabel}>Active</Text>
                        <Text style={[styles.zoneInfoValue, { color: venue.zone.is_active ? '#22c55e' : '#ef4444' }]}>
                          {venue.zone.is_active ? '● Yes' : '● Paused'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.noZoneWarn}>
                      <Text style={styles.noZoneWarnText}>
                        No zone on file — run venue_approval_fix.sql in Supabase and re-approve if needed.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  countBadge: {
    backgroundColor: '#f59e0b', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeText: { fontSize: 12, fontWeight: '800', color: '#050A15' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#29B6F6' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#4A6580' },
  tabBtnTextActive: { color: '#29B6F6' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 14, color: '#7A93AC', textAlign: 'center' },
  card: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16,
  },
  cardLeft: { flex: 1, gap: 3 },
  cardVenueName: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  cardMeta: { fontSize: 13, color: '#8EADC7' },
  cardAddress: { fontSize: 12, color: '#7A93AC' },
  chevron: { fontSize: 14, color: '#7A93AC' },
  formSection: { borderTopWidth: 1, borderTopColor: '#1A2E4A', padding: 16, gap: 10 },
  formTitle: { fontSize: 14, fontWeight: '700', color: '#29B6F6', marginBottom: 2 },
  formHint: { fontSize: 12, color: '#7A93AC', lineHeight: 17, marginBottom: 4 },
  label: {
    fontSize: 11, fontWeight: '700', color: '#8EADC7',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#050A15', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  typePills: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  typePill: {
    backgroundColor: '#050A15', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  typePillActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  typePillText: { fontSize: 12, color: '#8EADC7' },
  typePillTextActive: { color: '#29B6F6', fontWeight: '700' },
  coordRow: { flexDirection: 'row', gap: 10 },
  coordField: { flex: 1, gap: 6 },
  radiusHint: { fontSize: 11, color: '#4A6580' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  denyBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#ef4444',
  },
  denyBtnText: { fontSize: 14, fontWeight: '700', color: '#ef4444' },
  approveBtn: {
    flex: 2, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#29B6F6',
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#050A15' },
  btnDisabled: { opacity: 0.5 },
  liveCardInner: { padding: 16, gap: 8 },
  liveCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  zoneInfo: {
    backgroundColor: '#050A15', borderRadius: 10,
    borderWidth: 1, borderColor: '#1A2E4A',
    padding: 12, gap: 6, marginTop: 4,
  },
  zoneInfoRow: { flexDirection: 'row', gap: 10 },
  zoneInfoLabel: {
    fontSize: 11, fontWeight: '700', color: '#4A6580',
    width: 52, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  zoneInfoValue: { fontSize: 12, color: '#8EADC7', flex: 1 },
  noZoneWarn: {
    backgroundColor: '#f59e0b10', borderRadius: 8,
    borderWidth: 1, borderColor: '#f59e0b30',
    padding: 10, marginTop: 4,
  },
  noZoneWarnText: { fontSize: 12, color: '#f59e0b', lineHeight: 17 },
})
