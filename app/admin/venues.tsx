import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { geocodeAddress } from '@/lib/geocoding'

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_TYPES = ['bar', 'club', 'restaurant', 'cafe', 'venue', 'park', 'other']

const DENY_REASONS = [
  'Location could not be verified',
  'Incomplete or inaccurate information provided',
  'Venue type not supported in your area',
  'Does not meet HereNow community guidelines',
  'Other — see note below',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingVenue {
  id: string
  email: string | null
  display_name: string
  username: string | null
  created_at: string
  venue_address: string | null
  venue_suite:   string | null
  venue_city:    string | null
  venue_state:   string | null
  venue_zip:     string | null
  venue_lat:     number | null
  venue_lng:     number | null
  venue_type:    string | null
  venue_geocode_confidence: number | null
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
  venue_suite:   string | null
  venue_city:    string | null
  venue_state:   string | null
  venue_zip:     string | null
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceBadge(score: number | null) {
  if (score === null) return { label: 'No GPS', color: '#4A6580' }
  if (score >= 0.9)   return { label: `${Math.round(score * 100)}% — auto-approved`, color: '#22c55e' }
  if (score >= 0.7)   return { label: `${Math.round(score * 100)}% — needs review`,  color: '#f59e0b' }
  return               { label: `${Math.round(score * 100)}% — low confidence`,      color: '#ef4444' }
}

// OSM iframe map preview — web only, no API key needed
function MapPreview({ lat, lng }: { lat: string; lng: string }) {
  const latN = parseFloat(lat)
  const lngN = parseFloat(lng)
  if (Platform.OS !== 'web' || isNaN(latN) || isNaN(lngN)) return null
  const delta = 0.003
  const src =
    `https://www.openstreetmap.org/export/embed.html` +
    `?bbox=${lngN - delta},${latN - delta},${lngN + delta},${latN + delta}` +
    `&layer=mapnik&marker=${latN},${lngN}`
  return (
    // @ts-ignore — iframe is web-only
    <iframe
      key={src}
      src={src}
      style={{ width: '100%', height: 200, border: 'none', borderRadius: 10, marginTop: 4 }}
      title="Venue location preview"
    />
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminVenues() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [tab, setTab]               = useState<'pending' | 'live'>('pending')
  const [pending, setPending]       = useState<PendingVenue[]>([])
  const [live, setLive]             = useState<LiveVenue[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [forms, setForms]           = useState<Record<string, GeofenceForm>>({})
  const [submitting, setSubmitting]       = useState<string | null>(null)
  const [geocoding, setGeocoding]         = useState<Record<string, boolean>>({})
  const [geocodeStatus, setGeocodeStatus] = useState<Record<string, 'success' | 'notfound' | 'error'>>({})

  // Deny modal
  const [denyTarget, setDenyTarget] = useState<PendingVenue | null>(null)
  const [denyPreset, setDenyPreset] = useState<string>('')
  const [denyCustom, setDenyCustom] = useState<string>('')
  const [denyingId, setDenyingId]   = useState<string | null>(null)

  // Live venue zone toggling
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Live venue zone editing
  const [editingLive, setEditingLive]           = useState<string | null>(null)
  const [liveForms, setLiveForms]               = useState<Record<string, GeofenceForm>>({})
  const [editSubmitting, setEditSubmitting]     = useState<string | null>(null)
  const [editGeocoding, setEditGeocoding]       = useState<Record<string, boolean>>({})
  const [editGeocodeStatus, setEditGeocodeStatus] = useState<Record<string, 'success' | 'notfound' | 'error'>>({})


  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [pendingRes, approvedRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, display_name, username, created_at, venue_address, venue_suite, venue_city, venue_state, venue_zip, venue_lat, venue_lng, venue_type, venue_geocode_confidence')
        .eq('venue_status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name, username, venue_address, venue_suite, venue_city, venue_state, venue_zip, venue_type')
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

    const mergedPending: PendingVenue[] = pendingProfiles.map((p: any) => ({
      id:            p.id,
      email:         p.email ?? null,
      display_name:  p.display_name,
      username:      p.username ?? null,
      created_at:    p.created_at,
      venue_address:            p.venue_address            ?? null,
      venue_suite:              p.venue_suite              ?? null,
      venue_city:               p.venue_city               ?? null,
      venue_state:              p.venue_state              ?? null,
      venue_zip:                p.venue_zip                ?? null,
      venue_lat:                p.venue_lat                ?? null,
      venue_lng:                p.venue_lng                ?? null,
      venue_type:               p.venue_type               ?? null,
      venue_geocode_confidence: p.venue_geocode_confidence ?? null,
      existing_zone: zoneByOwner[p.id] ?? null,
    }))

    setPending(mergedPending)

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

    const liveVenues: LiveVenue[] = approvedProfiles.map((p: any) => ({
      id:            p.id,
      display_name:  p.display_name,
      username:      p.username ?? null,
      venue_address: p.venue_address ?? null,
      venue_suite:   p.venue_suite   ?? null,
      venue_city:    p.venue_city    ?? null,
      venue_state:   p.venue_state   ?? null,
      venue_zip:     p.venue_zip     ?? null,
      venue_type:    p.venue_type    ?? null,
      zone:          zoneByOwner[p.id] ?? null,
    }))
    setLive(liveVenues)

    // Pre-fill edit forms from current zone data
    const defaultLiveForms: Record<string, GeofenceForm> = {}
    for (const v of liveVenues) {
      const z = v.zone
      defaultLiveForms[v.id] = {
        zoneName: z?.name ?? v.display_name,
        zoneType: z?.type ?? v.venue_type ?? 'venue',
        lat:      z?.center_lat?.toString()  ?? '',
        lng:      z?.center_lng?.toString()  ?? '',
        radius:   z?.radius_meters?.toString() ?? '50',
      }
    }
    setLiveForms(defaultLiveForms)

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  // ── Form helpers ──────────────────────────────────────────────────────────

  const updateForm = (venueId: string, field: keyof GeofenceForm, value: string) => {
    setForms((prev) => ({ ...prev, [venueId]: { ...prev[venueId], [field]: value } }))
  }

  const fetchCoordinates = async (venue: PendingVenue) => {
    if (!venue.venue_address && !venue.venue_city) {
      setGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'notfound' }))
      return
    }
    setGeocoding((prev) => ({ ...prev, [venue.id]: true }))
    setGeocodeStatus((prev) => { const next = { ...prev }; delete next[venue.id]; return next })
    const parts = [venue.venue_address, venue.venue_suite, venue.venue_city, venue.venue_state, venue.venue_zip].filter(Boolean)
    const q = encodeURIComponent(parts.join(', '))
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      )
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setForms((prev) => ({
          ...prev,
          [venue.id]: { ...prev[venue.id], lat: data[0].lat, lng: data[0].lon },
        }))
        setGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'success' }))
      } else {
        setGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'notfound' }))
      }
    } catch {
      setGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'error' }))
    } finally {
      setGeocoding((prev) => ({ ...prev, [venue.id]: false }))
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  const handleApprove = async (venue: PendingVenue) => {
    const form = forms[venue.id]
    if (!form) return

    const lat    = parseFloat(form.lat)
    const lng    = parseFloat(form.lng)
    const radius = parseInt(form.radius)

    if (!form.zoneName.trim()) { showToast('Zone name required.', 'error'); return }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      showToast(form.lat ? 'Latitude must be −90 to 90.' : 'Tap "Fetch Coordinates" to auto-fill, or enter manually.', 'error')
      return
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      showToast(form.lng ? 'Longitude must be −180 to 180.' : 'Tap "Fetch Coordinates" to auto-fill, or enter manually.', 'error')
      return
    }
    if (isNaN(radius) || radius < 10 || radius > 5000) { showToast('Radius must be 10–5000 m.', 'error'); return }

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
        showToast(error.message ?? 'Approval failed. Try again.', 'error')
      } else {
        showToast(`${venue.display_name} is now live!`, 'success')
        load()
        setTab('live')
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
    setDenyPreset('')
    setDenyCustom('')
    setDenyTarget(venue)
  }

  const doDenyConfirmed = async () => {
    if (!denyTarget || !denyPreset) { showToast('Select a reason.', 'error'); return }
    setDenyingId(denyTarget.id)

    const reasonText = denyPreset + (denyCustom.trim() ? `\n\n${denyCustom.trim()}` : '')

    await supabase.rpc('admin_deny_venue', { p_profile_id: denyTarget.id })
    await supabase.from('profiles').update({ denial_reason: reasonText }).eq('id', denyTarget.id)

    setPending((prev) => prev.filter((v) => v.id !== denyTarget.id))
    showToast(`${denyTarget.display_name} application denied.`, 'info')

    if (denyTarget.email && Platform.OS === 'web') {
      const subject = encodeURIComponent(`Your HereNow Application — ${denyTarget.display_name}`)
      const body = encodeURIComponent(
        `Hello ${denyTarget.display_name},\n\n` +
        `Thank you for your interest in HereNow. After reviewing your application, we are unable to approve your venue at this time.\n\n` +
        `Reason: ${reasonText}\n\n` +
        `If you have questions or would like to update your information and reapply, please reply to this email.\n\n` +
        `Best,\nThe HereNow Team`
      )
      window.open(`mailto:${denyTarget.email}?subject=${subject}&body=${body}`, '_blank')
    }

    setDenyingId(null)
    setDenyTarget(null)
  }

  // ── Live venue management ─────────────────────────────────────────────────

  const handleToggleZone = async (venue: LiveVenue) => {
    if (!venue.zone) return
    setTogglingId(venue.id)
    const newActive = !venue.zone.is_active
    const { error } = await supabase
      .from('zones')
      .update({ is_active: newActive })
      .eq('id', venue.zone.id)
    setTogglingId(null)
    if (error) { showToast('Failed to update zone.', 'error'); return }
    showToast(
      newActive ? `${venue.display_name} zone is live.` : `${venue.display_name} zone paused.`,
      newActive ? 'success' : 'info'
    )
    load()
  }

  // ── Live zone editing ─────────────────────────────────────────────────────

  const updateLiveForm = (venueId: string, field: keyof GeofenceForm, value: string) => {
    setLiveForms((prev) => ({ ...prev, [venueId]: { ...prev[venueId], [field]: value } }))
  }

  const fetchLiveCoordinates = async (venue: LiveVenue) => {
    if (!venue.venue_address && !venue.venue_city) {
      setEditGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'notfound' }))
      return
    }
    setEditGeocoding((prev) => ({ ...prev, [venue.id]: true }))
    setEditGeocodeStatus((prev) => { const next = { ...prev }; delete next[venue.id]; return next })
    try {
      const result = await geocodeAddress(
        venue.venue_address ?? '',
        venue.venue_suite  ?? '',
        venue.venue_city   ?? '',
        venue.venue_state  ?? '',
        venue.venue_zip    ?? '',
      )
      if (result) {
        setLiveForms((prev) => ({
          ...prev,
          [venue.id]: { ...prev[venue.id], lat: String(result.lat), lng: String(result.lng) },
        }))
        setEditGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'success' }))
      } else {
        setEditGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'notfound' }))
      }
    } catch {
      setEditGeocodeStatus((prev) => ({ ...prev, [venue.id]: 'error' }))
    } finally {
      setEditGeocoding((prev) => ({ ...prev, [venue.id]: false }))
    }
  }

  const handleSaveLiveZone = async (venue: LiveVenue) => {
    const form = liveForms[venue.id]
    if (!form) return

    const lat    = parseFloat(form.lat)
    const lng    = parseFloat(form.lng)
    const radius = parseInt(form.radius)

    if (!form.zoneName.trim()) { showToast('Zone name required.', 'error'); return }
    if (isNaN(lat) || lat < -90 || lat > 90) { showToast('Invalid latitude.', 'error'); return }
    if (isNaN(lng) || lng < -180 || lng > 180) { showToast('Invalid longitude.', 'error'); return }
    if (isNaN(radius) || radius < 10 || radius > 5000) { showToast('Radius must be 10–5000 m.', 'error'); return }

    const doSave = async () => {
      setEditSubmitting(venue.id)
      const { error } = await supabase.rpc('admin_setup_zone', {
        p_owner_id:  venue.id,
        p_zone_name: form.zoneName.trim(),
        p_zone_type: form.zoneType,
        p_lat:       lat,
        p_lng:       lng,
        p_radius:    radius,
      })
      setEditSubmitting(null)
      if (error) {
        showToast(error.message ?? 'Update failed. Try again.', 'error')
      } else {
        showToast(`${venue.display_name} zone updated!`, 'success')
        setEditingLive(null)
        load()
      }
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(
        `Update zone for "${venue.display_name}"?\n\nNew location: ${lat}, ${lng}\nRadius: ${radius}m`
      )
      if (ok) doSave()
    } else {
      Alert.alert(
        `Update "${venue.display_name}"?`,
        `New location: ${lat}, ${lng}\nRadius: ${radius}m`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: doSave },
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
        keyboardShouldPersistTaps="handled"
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
              const badge = confidenceBadge(venue.venue_geocode_confidence)
              return (
                <View key={venue.id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => setExpanded(isOpen ? null : venue.id)}
                  >
                    <View style={styles.cardLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.cardVenueName}>{venue.display_name}</Text>
                        <Text style={{ fontSize: 11, color: badge.color, fontWeight: '700' }}>
                          ● {badge.label}
                        </Text>
                      </View>
                      {(venue.venue_address || venue.venue_city) && (
                        <Text style={styles.cardAddress}>
                          {[venue.venue_address, venue.venue_suite, venue.venue_city, venue.venue_state, venue.venue_zip].filter(Boolean).join(', ')}
                        </Text>
                      )}
                      {venue.email    ? <Text style={styles.cardEmail}>{venue.email}</Text>         : null}
                      {venue.username ? <Text style={styles.cardMeta}>@{venue.username}</Text>      : null}
                      {venue.venue_type ? <Text style={styles.cardMeta}>{venue.venue_type}</Text>  : null}
                    </View>
                    <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.formSection}>
                      <Text style={styles.formTitle}>Geofencing Setup</Text>
                      <Text style={styles.formHint}>
                        {(venue.venue_geocode_confidence ?? 0) >= 0.9
                          ? `✓ Mapbox returned ${Math.round((venue.venue_geocode_confidence ?? 0) * 100)}% confidence — coordinates are precise. Verify the map pin is on the right building, then approve.`
                          : (venue.venue_lat && venue.venue_lng)
                            ? `⚠ Geocoder returned low confidence (${Math.round((venue.venue_geocode_confidence ?? 0) * 100)}%). Verify the map pin below — move it manually if it's off.`
                            : venue.venue_address
                              ? `Address on file: ${[venue.venue_address, venue.venue_suite, venue.venue_city, venue.venue_state, venue.venue_zip].filter(Boolean).join(', ')} — geocoding failed. Use Re-fetch or enter coordinates manually.`
                              : 'No address on file. Enter coordinates manually.'
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
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typePills} keyboardShouldPersistTaps="handled">
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

                      {(venue.venue_address || venue.venue_city) && (
                        <>
                          <TouchableOpacity
                            style={[styles.geocodeBtn, geocoding[venue.id] && styles.btnDisabled]}
                            onPress={() => !geocoding[venue.id] && fetchCoordinates(venue)}
                          >
                            {geocoding[venue.id]
                              ? <ActivityIndicator size="small" color="#050A15" />
                              : <Text style={styles.geocodeBtnText}>
                                  {form.lat && form.lng ? '🔄 Re-fetch Coordinates' : '📍 Fetch Coordinates from Address'}
                                </Text>
                            }
                          </TouchableOpacity>
                          {geocodeStatus[venue.id] === 'success' && (
                            <Text style={{ color: '#22c55e', fontSize: 12, marginTop: 4 }}>✓ Coordinates fetched — check lat/lng below</Text>
                          )}
                          {geocodeStatus[venue.id] === 'notfound' && (
                            <Text style={{ color: '#f59e0b', fontSize: 12, marginTop: 4 }}>Address not found. Enter coordinates manually via maps.google.com → right-click → copy lat/lng.</Text>
                          )}
                          {geocodeStatus[venue.id] === 'error' && (
                            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>Network error — check connection and try again.</Text>
                          )}
                        </>
                      )}

                      <View style={styles.coordRow}>
                        <View style={styles.coordField}>
                          <Text style={styles.label}>Latitude</Text>
                          <TextInput
                            style={[styles.input, !form.lat && styles.inputEmpty]}
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
                            style={[styles.input, !form.lng && styles.inputEmpty]}
                            value={form.lng}
                            onChangeText={(v) => updateForm(venue.id, 'lng', v)}
                            placeholder="e.g. -87.6298"
                            placeholderTextColor="#4A6580"
                            keyboardType="default"
                          />
                        </View>
                      </View>

                      <MapPreview lat={form.lat} lng={form.lng} />

                      <Text style={styles.label}>Check-in Radius (meters)</Text>
                      <TextInput
                        style={styles.input}
                        value={form.radius}
                        onChangeText={(v) => updateForm(venue.id, 'radius', v)}
                        placeholder="e.g. 75"
                        placeholderTextColor="#4A6580"
                        keyboardType="number-pad"
                      />
                      <Text style={styles.radiusHint}>
                        Typical: 75m for a bar/club, 150–200m for a park or outdoor venue.
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
            live.map((venue) => {
              const toggling  = togglingId === venue.id
              const isEditing = editingLive === venue.id
              const editForm  = liveForms[venue.id] ?? { zoneName: venue.display_name, zoneType: venue.venue_type ?? 'venue', lat: '', lng: '', radius: '50' }
              const editBusy  = editSubmitting === venue.id
              return (
                <View key={venue.id} style={styles.card}>
                  <View style={styles.liveCardInner}>
                    <View style={styles.liveCardHeader}>
                      <View style={[styles.liveDot, { backgroundColor: venue.zone?.is_active ? '#22c55e' : '#f59e0b' }]} />
                      <Text style={[styles.cardVenueName, { flex: 1 }]}>{venue.display_name}</Text>
                    </View>

                    {(venue.venue_address || venue.venue_city) && (
                      <Text style={styles.cardAddress}>
                        {[venue.venue_address, venue.venue_suite, venue.venue_city, venue.venue_state].filter(Boolean).join(', ')}
                      </Text>
                    )}
                    {venue.username && <Text style={styles.cardMeta}>@{venue.username}</Text>}

                    {venue.zone ? (
                      <>
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
                            <Text style={styles.zoneInfoLabel}>Status</Text>
                            <Text style={[styles.zoneInfoValue, { color: venue.zone.is_active ? '#22c55e' : '#f59e0b' }]}>
                              {venue.zone.is_active ? '● Live' : '● Paused'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.liveActions}>
                          <TouchableOpacity
                            style={[
                              styles.toggleZoneBtn, { flex: 1 },
                              venue.zone.is_active ? styles.toggleZoneBtnPause : styles.toggleZoneBtnResume,
                              toggling && styles.btnDisabled,
                            ]}
                            onPress={() => !toggling && handleToggleZone(venue)}
                          >
                            {toggling
                              ? <ActivityIndicator size="small" color="#f8fafc" />
                              : <Text style={styles.toggleZoneBtnText}>
                                  {venue.zone.is_active ? '⏸ Pause' : '▶ Resume'}
                                </Text>
                            }
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.editZoneBtn, isEditing && styles.editZoneBtnActive]}
                            onPress={() => setEditingLive(isEditing ? null : venue.id)}
                          >
                            <Text style={styles.editZoneBtnText}>{isEditing ? '✕ Cancel' : '✎ Edit Zone'}</Text>
                          </TouchableOpacity>
                        </View>

                        {isEditing && (
                          <View style={styles.editSection}>
                            <Text style={styles.formTitle}>Edit Zone Location</Text>
                            <Text style={styles.formHint}>
                              Right-click the exact venue entrance on maps.google.com → "Copy coordinates" and paste below. Or use Re-fetch to try the geocoder again.
                            </Text>

                            <Text style={styles.label}>Zone Name</Text>
                            <TextInput
                              style={styles.input}
                              value={editForm.zoneName}
                              onChangeText={(v) => updateLiveForm(venue.id, 'zoneName', v)}
                              placeholderTextColor="#4A6580"
                            />

                            <Text style={styles.label}>Zone Type</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typePills} keyboardShouldPersistTaps="handled">
                              {ZONE_TYPES.map((t) => (
                                <TouchableOpacity
                                  key={t}
                                  style={[styles.typePill, editForm.zoneType === t && styles.typePillActive]}
                                  onPress={() => updateLiveForm(venue.id, 'zoneType', t)}
                                >
                                  <Text style={[styles.typePillText, editForm.zoneType === t && styles.typePillTextActive]}>{t}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>

                            {(venue.venue_address || venue.venue_city) && (
                              <>
                                <TouchableOpacity
                                  style={[styles.geocodeBtn, editGeocoding[venue.id] && styles.btnDisabled]}
                                  onPress={() => !editGeocoding[venue.id] && fetchLiveCoordinates(venue)}
                                >
                                  {editGeocoding[venue.id]
                                    ? <ActivityIndicator size="small" color="#050A15" />
                                    : <Text style={styles.geocodeBtnText}>🔄 Re-fetch Coordinates from Address</Text>
                                  }
                                </TouchableOpacity>
                                {editGeocodeStatus[venue.id] === 'success' && (
                                  <Text style={{ color: '#22c55e', fontSize: 12, marginTop: 4 }}>✓ Coordinates updated — verify below then save</Text>
                                )}
                                {editGeocodeStatus[venue.id] === 'notfound' && (
                                  <Text style={{ color: '#f59e0b', fontSize: 12, marginTop: 4 }}>Address not found by Mapbox — check the address on the venue profile and try again.</Text>
                                )}
                                {editGeocodeStatus[venue.id] === 'error' && (
                                  <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>Network error — try again.</Text>
                                )}
                              </>
                            )}

                            <View style={styles.coordRow}>
                              <View style={styles.coordField}>
                                <Text style={styles.label}>Latitude</Text>
                                <TextInput
                                  style={styles.input}
                                  value={editForm.lat}
                                  onChangeText={(v) => updateLiveForm(venue.id, 'lat', v)}
                                  placeholder="e.g. 36.18432"
                                  placeholderTextColor="#4A6580"
                                  keyboardType="default"
                                />
                              </View>
                              <View style={styles.coordField}>
                                <Text style={styles.label}>Longitude</Text>
                                <TextInput
                                  style={styles.input}
                                  value={editForm.lng}
                                  onChangeText={(v) => updateLiveForm(venue.id, 'lng', v)}
                                  placeholder="e.g. -86.75332"
                                  placeholderTextColor="#4A6580"
                                  keyboardType="default"
                                />
                              </View>
                            </View>

                            <MapPreview lat={editForm.lat} lng={editForm.lng} />

                            <Text style={styles.label}>Radius (meters)</Text>
                            <TextInput
                              style={styles.input}
                              value={editForm.radius}
                              onChangeText={(v) => updateLiveForm(venue.id, 'radius', v)}
                              placeholder="e.g. 75"
                              placeholderTextColor="#4A6580"
                              keyboardType="number-pad"
                            />
                            <Text style={styles.radiusHint}>Typical: 75m bar/club · 150–200m outdoor</Text>

                            <TouchableOpacity
                              style={[styles.approveBtn, editBusy && styles.btnDisabled]}
                              onPress={() => !editBusy && handleSaveLiveZone(venue)}
                            >
                              {editBusy
                                ? <ActivityIndicator color="#050A15" size="small" />
                                : <Text style={styles.approveBtnText}>✓ Save Zone Update</Text>
                              }
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.noZoneWarn}>
                        <Text style={styles.noZoneWarnText}>
                          No zone on file — run venue_approval_fix.sql in Supabase and re-approve if needed.
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )
            })
          )
        )}
      </ScrollView>

      {/* ── Deny Modal ─────────────────────────────────────────────────────── */}
      {denyTarget && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => setDenyTarget(null)}
            activeOpacity={1}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Deny "{denyTarget.display_name}"?</Text>
            <Text style={styles.modalSub}>
              Select a reason. It will be saved and you can email it to the venue.
            </Text>

            <View style={styles.reasonList}>
              {DENY_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonRow, denyPreset === r && styles.reasonRowActive]}
                  onPress={() => setDenyPreset(r)}
                >
                  <View style={[styles.reasonRadio, denyPreset === r && styles.reasonRadioActive]} />
                  <Text style={[styles.reasonText, denyPreset === r && styles.reasonTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.denyTextarea}
              value={denyCustom}
              onChangeText={setDenyCustom}
              placeholder="Additional notes (optional)"
              placeholderTextColor="#4A6580"
              multiline
              maxLength={500}
            />

            {denyTarget.email && (
              <Text style={styles.emailNote}>
                📧 After denying, your email client will open with a pre-written message to {denyTarget.email}
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDenyTarget(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDenyBtn, (!denyPreset || !!denyingId) && styles.btnDisabled]}
                onPress={doDenyConfirmed}
                disabled={!denyPreset || !!denyingId}
              >
                {denyingId
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalDenyText}>✗ Deny Application</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  cardEmail: { fontSize: 12, color: '#29B6F6' },
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
  liveCardInner: { padding: 16, gap: 10 },
  liveCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  zoneInfo: {
    backgroundColor: '#050A15', borderRadius: 10,
    borderWidth: 1, borderColor: '#1A2E4A',
    padding: 12, gap: 6,
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
    padding: 10,
  },
  noZoneWarnText: { fontSize: 12, color: '#f59e0b', lineHeight: 17 },
  geocodeBtn: {
    backgroundColor: '#22c55e', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  geocodeBtnText: { fontSize: 13, fontWeight: '700', color: '#050A15' },
  inputEmpty: { borderColor: '#f59e0b50' },
  liveActions: { flexDirection: 'row', gap: 8 },
  toggleZoneBtn: {
    borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', borderWidth: 1,
  },
  toggleZoneBtnPause: { borderColor: '#f59e0b', backgroundColor: '#f59e0b10' },
  toggleZoneBtnResume: { borderColor: '#22c55e', backgroundColor: '#22c55e10' },
  toggleZoneBtnText: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  editZoneBtn: {
    borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14,
    alignItems: 'center', borderWidth: 1,
    borderColor: '#29B6F6', backgroundColor: '#29B6F610',
  },
  editZoneBtnActive: {
    borderColor: '#7A93AC', backgroundColor: '#7A93AC10',
  },
  editZoneBtnText: { fontSize: 13, fontWeight: '700', color: '#29B6F6' },
  editSection: {
    borderTopWidth: 1, borderTopColor: '#1A2E4A',
    marginTop: 8, paddingTop: 14, gap: 10,
  },

  // Deny modal
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(2,8,16,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
  },
  modalCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    gap: 14,
    borderWidth: 1,
    borderColor: '#ef444430',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  modalSub: { fontSize: 13, color: '#7A93AC', lineHeight: 18 },
  reasonList: { gap: 8 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#050A15', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  reasonRowActive: { borderColor: '#ef4444', backgroundColor: '#ef444408' },
  reasonRadio: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: '#4A6580',
    flexShrink: 0,
  },
  reasonRadioActive: { borderColor: '#ef4444', backgroundColor: '#ef4444' },
  reasonText: { fontSize: 13, color: '#8EADC7', flex: 1, lineHeight: 18 },
  reasonTextActive: { color: '#f8fafc', fontWeight: '600' },
  denyTextarea: {
    backgroundColor: '#050A15', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
    minHeight: 72, textAlignVertical: 'top',
  },
  emailNote: { fontSize: 12, color: '#29B6F6', lineHeight: 17 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#1A2E4A',
  },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: '#7A93AC' },
  modalDenyBtn: {
    flex: 2, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#ef4444',
  },
  modalDenyText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})
