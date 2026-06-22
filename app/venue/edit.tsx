import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

const RADIUS_OPTIONS = [
  { label: 'Small (bar, coffee shop)', meters: 80 },
  { label: 'Medium (restaurant, gym)', meters: 150 },
  { label: 'Large (venue, event space)', meters: 300 },
]

interface VenueZone {
  id: string
  name: string
  description: string | null
  center_lat: number
  center_lng: number
  radius_meters: number
}

export default function VenueEditScreen() {
  const insets = useSafeAreaInsets()
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [locating, setLocating]   = useState(false)
  const [userId, setUserId]       = useState<string | null>(null)
  const [existingZone, setExistingZone] = useState<VenueZone | null>(null)

  const [name, setName]           = useState('')
  const [description, setDescription] = useState('')
  const [lat, setLat]             = useState<number | null>(null)
  const [lng, setLng]             = useState<number | null>(null)
  const [radius, setRadius]       = useState(RADIUS_OPTIONS[0].meters)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }
      setUserId(user.id)

      const { data: zones } = await supabase
        .from('zones')
        .select('id, name, description, center_lat, center_lng, radius_meters')
        .eq('owner_id', user.id)
        .limit(1)

      const z = zones?.[0] ?? null
      if (z) {
        setExistingZone(z)
        setName(z.name)
        setDescription(z.description ?? '')
        setLat(z.center_lat)
        setLng(z.center_lng)
        setRadius(z.radius_meters)
      } else {
        // Pre-fill name from profile display_name (which we set to venue name on signup)
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle()
        setName(profile?.display_name ?? '')
      }

      setLoading(false)
    }
    load()
  }, [])

  const grabLocation = async () => {
    setLocating(true)
    try {
      if (Platform.OS === 'web') {
        if (!navigator.geolocation) {
          Alert.alert('Not supported', 'Geolocation is not available in this browser.')
          return
        }
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLat(pos.coords.latitude)
              setLng(pos.coords.longitude)
              resolve()
            },
            (err) => reject(new Error(err.message ?? 'Could not get location.')),
            { enableHighAccuracy: true, timeout: 10000 }
          )
        })
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'Location access is needed to pin your venue.')
          return
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
      }
    } catch (err: any) {
      Alert.alert('Location error', err?.message ?? 'Could not get location. Make sure location access is allowed.')
    } finally {
      setLocating(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Venue name required'); return }
    if (lat === null || lng === null) {
      Alert.alert('Location required', 'Tap "Use My Location" while you\'re standing at your venue to set the pin.')
      return
    }
    if (!userId) return

    setSaving(true)

    // PostgREST accepts WKT for geography columns — lng before lat in WKT
    const centerWkt = `POINT(${lng} ${lat})`

    if (existingZone) {
      const { error } = await supabase
        .from('zones')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          center: centerWkt,
          center_lat: lat,
          center_lng: lng,
          radius_meters: radius,
        })
        .eq('id', existingZone.id)

      setSaving(false)
      if (error) { Alert.alert('Save failed', error.message); return }
    } else {
      const { error } = await supabase
        .from('zones')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          center: centerWkt,
          center_lat: lat,
          center_lng: lng,
          radius_meters: radius,
          created_by: userId,
          owner_id: userId,
          is_active: true,
        })

      setSaving(false)
      if (error) { Alert.alert('Save failed', error.message); return }
    }

    router.replace('/venue/dashboard' as any)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" size="large" />
      </View>
    )
  }

  const hasLocation = lat !== null && lng !== null

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{existingZone ? 'Edit Venue' : 'Set Up Your Venue'}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        >
          {saving
            ? <ActivityIndicator color="#050A15" size="small" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Location — most important field, goes first */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>📍 Venue Location</Text>
          <Text style={styles.sectionHint}>
            Stand at your venue (or anywhere inside it) and tap the button below.
            This pins the center of your check-in zone.
          </Text>

          <TouchableOpacity
            style={[styles.locBtn, hasLocation && styles.locBtnDone, locating && styles.locBtnLoading]}
            onPress={grabLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator color="#f8fafc" size="small" />
            ) : (
              <Text style={[styles.locBtnText, hasLocation && styles.locBtnTextDone]}>
                {hasLocation ? '✓ Location set — tap to update' : '📡 Use My Current Location'}
              </Text>
            )}
          </TouchableOpacity>

          {hasLocation && (
            <Text style={styles.coordText}>
              {lat!.toFixed(6)}, {lng!.toFixed(6)}
            </Text>
          )}
        </View>

        {/* Zone radius */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Check-in Radius</Text>
          <Text style={styles.sectionHint}>
            Users within this distance from your pin can check in. Smaller = more precise.
          </Text>
          <View style={styles.radiusOptions}>
            {RADIUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.meters}
                style={[styles.radiusPill, radius === opt.meters && styles.radiusPillActive]}
                onPress={() => setRadius(opt.meters)}
              >
                <Text style={[styles.radiusText, radius === opt.meters && styles.radiusTextActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.radiusMeters, radius === opt.meters && styles.radiusMetersActive]}>
                  {opt.meters}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Venue name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Venue Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. The Cobra, 3rd & Lindsley"
            placeholderTextColor="#4A6580"
            maxLength={60}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What kind of spot is this? What's the vibe?"
            placeholderTextColor="#4A6580"
            multiline
            maxLength={200}
          />
          <Text style={styles.charCount}>{description.length}/200</Text>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            🔒 Users only see that a venue exists and how many people are checked in.
            Their individual profiles are only visible to other checked-in guests — never to you as the venue owner.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  saveBtn: {
    backgroundColor: '#29B6F6', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#050A15', fontWeight: '800', fontSize: 14 },

  scroll: { flex: 1 },
  content: { padding: 20, gap: 28, paddingBottom: 60 },

  section: { gap: 10 },
  sectionLabel: {
    fontSize: 13, fontWeight: '800', color: '#8EADC7',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sectionHint: { fontSize: 13, color: '#4A6580', lineHeight: 18 },

  locBtn: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  locBtnDone: { borderColor: '#22c55e44', backgroundColor: '#0a1f0f' },
  locBtnLoading: { opacity: 0.7 },
  locBtnText: { fontSize: 15, fontWeight: '700', color: '#29B6F6' },
  locBtnTextDone: { color: '#22c55e' },
  coordText: { fontSize: 11, color: '#2A3F55', textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },

  radiusOptions: { gap: 8 },
  radiusPill: {
    backgroundColor: '#0D1B2E', borderRadius: 12, borderWidth: 1, borderColor: '#1A2E4A',
    padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  radiusPillActive: { borderColor: '#29B6F6', backgroundColor: '#29B6F610' },
  radiusText: { fontSize: 14, color: '#8EADC7', fontWeight: '500', flex: 1 },
  radiusTextActive: { color: '#29B6F6', fontWeight: '700' },
  radiusMeters: { fontSize: 12, color: '#4A6580' },
  radiusMetersActive: { color: '#29B6F680' },

  input: {
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
    borderRadius: 12, padding: 14, color: '#f8fafc', fontSize: 15,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#4A6580', textAlign: 'right' },

  infoCard: {
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  infoText: { fontSize: 12, color: '#4A6580', lineHeight: 17, textAlign: 'center' },
})
