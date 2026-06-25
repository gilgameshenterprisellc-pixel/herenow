import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface PendingVenue {
  id: string
  display_name: string
  username: string | null
  created_at: string
  existing_zone: {
    id: string
    name: string
    type: string
    center_lat: number | null
    center_lng: number | null
    radius_meters: number | null
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

export default function AdminVenues() {
  const insets = useSafeAreaInsets()
  const [venues, setVenues]       = useState<PendingVenue[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [forms, setForms]         = useState<Record<string, GeofenceForm>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: pendingProfiles } = await supabase
      .from('profiles')
      .select('id, display_name, username, created_at')
      .eq('venue_status', 'pending')
      .order('created_at', { ascending: true })

    if (!pendingProfiles?.length) {
      setVenues([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const ownerIds = pendingProfiles.map((p) => p.id)
    const { data: zones } = await supabase
      .from('zones')
      .select('id, name, type, center_lat, center_lng, radius_meters, owner_id')
      .in('owner_id', ownerIds)

    const zoneByOwner: Record<string, any> = {}
    for (const z of zones ?? []) zoneByOwner[z.owner_id] = z

    const merged: PendingVenue[] = pendingProfiles.map((p) => ({
      id:           p.id,
      display_name: p.display_name,
      username:     p.username,
      created_at:   p.created_at,
      existing_zone: zoneByOwner[p.id] ?? null,
    }))

    setVenues(merged)

    // Pre-fill forms from existing zone data
    const defaultForms: Record<string, GeofenceForm> = {}
    for (const v of merged) {
      const z = v.existing_zone
      defaultForms[v.id] = {
        zoneName: z?.name ?? '',
        zoneType: z?.type ?? 'venue',
        lat:      z?.center_lat?.toString() ?? '',
        lng:      z?.center_lng?.toString() ?? '',
        radius:   z?.radius_meters?.toString() ?? '50',
      }
    }
    setForms(defaultForms)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const updateForm = (venueId: string, field: keyof GeofenceForm, value: string) => {
    setForms((prev) => ({ ...prev, [venueId]: { ...prev[venueId], [field]: value } }))
  }

  const handleApprove = async (venue: PendingVenue) => {
    const form = forms[venue.id]
    if (!form) return

    const lat = parseFloat(form.lat)
    const lng = parseFloat(form.lng)
    const radius = parseInt(form.radius)

    if (!form.zoneName.trim()) { Alert.alert('Venue name required'); return }
    if (isNaN(lat) || lat < -90 || lat > 90) { Alert.alert('Invalid latitude', 'Enter a value between -90 and 90'); return }
    if (isNaN(lng) || lng < -180 || lng > 180) { Alert.alert('Invalid longitude', 'Enter a value between -180 and 180'); return }
    if (isNaN(radius) || radius < 10 || radius > 5000) { Alert.alert('Invalid radius', 'Radius must be between 10 and 5000 meters'); return }

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
        Alert.alert('Error', error.message)
      } else {
        Alert.alert('Approved ✓', `${venue.display_name} is now live.`)
        setVenues((prev) => prev.filter((v) => v.id !== venue.id))
      }
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(`Approve ${venue.display_name}?\n\nZone: ${form.zoneName}\nLocation: ${lat}, ${lng}\nRadius: ${radius}m`)
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

  const handleDeny = (venue: PendingVenue) => {
    const doDeny = async () => {
      setSubmitting(venue.id)
      await supabase.rpc('admin_deny_venue', { p_profile_id: venue.id })
      setSubmitting(null)
      setVenues((prev) => prev.filter((v) => v.id !== venue.id))
    }

    if (Platform.OS === 'web') {
      const ok = (window as any).confirm(`Deny ${venue.display_name}?\n\nThe owner will see their application as denied.`)
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Venue Approvals</Text>
        {venues.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{venues.length}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
        ) : venues.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySub}>No pending venue applications.</Text>
          </View>
        ) : (
          venues.map((venue) => {
            const isOpen = expanded === venue.id
            const form   = forms[venue.id] ?? { zoneName: '', zoneType: 'venue', lat: '', lng: '', radius: '50' }
            const busy   = submitting === venue.id
            return (
              <View key={venue.id} style={styles.card}>
                <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(isOpen ? null : venue.id)}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardVenueName}>{venue.existing_zone?.name ?? '(zone not set up yet)'}</Text>
                    <Text style={styles.cardOwner}>Owner: {venue.display_name}{venue.username ? ` @${venue.username}` : ''}</Text>
                    {venue.existing_zone?.type ? <Text style={styles.cardType}>Type: {venue.existing_zone.type}</Text> : null}
                  </View>
                  <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.formSection}>
                    <Text style={styles.formTitle}>Geofencing Setup</Text>
                    <Text style={styles.formHint}>
                      Find the coordinates at maps.google.com → right-click the venue location → copy lat/lng.
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
        )}
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
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  countBadge: {
    backgroundColor: '#f59e0b', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeText: { fontSize: 12, fontWeight: '800', color: '#050A15' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 14, color: '#7A93AC' },
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
  cardOwner:  { fontSize: 13, color: '#8EADC7' },
  cardAddress: { fontSize: 12, color: '#7A93AC' },
  cardType:   { fontSize: 12, color: '#7A93AC' },
  chevron: { fontSize: 14, color: '#7A93AC' },
  formSection: { borderTopWidth: 1, borderTopColor: '#1A2E4A', padding: 16, gap: 10 },
  formTitle: { fontSize: 14, fontWeight: '700', color: '#29B6F6', marginBottom: 2 },
  formHint:  { fontSize: 12, color: '#7A93AC', lineHeight: 17, marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
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
})
