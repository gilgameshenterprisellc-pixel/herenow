import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Location from 'expo-location'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import PinPicker from '@/components/PinPicker'

type AccessState = 'loading' | 'denied' | 'pending' | 'granted'

const VENUE_TYPES = [
  { id: 'bar',        emoji: '🍺', label: 'Bar' },
  { id: 'cafe',       emoji: '☕', label: 'Café' },
  { id: 'restaurant', emoji: '🍽️', label: 'Restaurant' },
  { id: 'venue',      emoji: '🎵', label: 'Music Venue' },
  { id: 'park',       emoji: '🌳', label: 'Park / Outdoor' },
  { id: 'gym',        emoji: '🏋️', label: 'Gym' },
  { id: 'library',    emoji: '📚', label: 'Library' },
  { id: 'cowork',     emoji: '💻', label: 'Co-working' },
  { id: 'other',      emoji: '📍', label: 'Other' },
]

export default function CreateZoneScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [access, setAccess]           = useState<AccessState>('loading')
  const [name, setName]               = useState('')
  const [desc, setDesc]               = useState('')
  const [type, setType]               = useState('')
  const [radius, setRadius]           = useState('20')
  const [location, setLocation]       = useState<{ lat: number; lng: number } | null>(null)
  const [locLoading, setLocLoading]   = useState(false)
  const [creating, setCreating]       = useState(false)

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_venue_owner, venue_status')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.is_venue_owner) {
        // Regular user — silently send them home
        router.replace('/(tabs)')
        return
      }
      if (profile.venue_status !== 'approved') {
        setAccess('pending')
      } else {
        setAccess('granted')
        fetchLocation()
      }
    }
    checkAccess()
  }, [])

  const fetchLocation = async () => {
    setLocLoading(true)
    try {
      if (Platform.OS === 'web') {
        if (!navigator.geolocation) {
          showToast('Geolocation not supported in this browser', 'error')
          return
        }
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
              resolve()
            },
            (err) => reject(new Error(err.message ?? 'Could not get location')),
            { enableHighAccuracy: true, timeout: 10000 }
          )
        })
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          showToast('Location access needed to create a venue zone', 'error')
          return
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      }
    } catch (err: any) {
      showToast(err?.message ?? 'Could not get location', 'error')
    } finally {
      setLocLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) { showToast('Give this venue a name.', 'error'); return }
    if (!location) { showToast('Tap "Use my location" to set the zone center.', 'error'); return }

    const radiusNum = parseInt(radius, 10)
    if (isNaN(radiusNum) || radiusNum < 10 || radiusNum > 500) {
      showToast('Radius must be between 10m and 500m.', 'error')
      return
    }

    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }

    const { data, error } = await supabase
      .from('zones')
      .insert({
        name: name.trim(),
        description: desc.trim() || null,
        venue_type: type || null,
        radius_meters: radiusNum,
        center: `POINT(${location.lng} ${location.lat})`,
        created_by: user.id,
        owner_id: user.id,
      })
      .select('id')
      .single()

    setCreating(false)

    if (error || !data) {
      showToast(error?.message ?? 'Failed to create venue — try again.', 'error')
      return
    }

    router.replace(`/zone/${data.id}`)
  }

  if (access === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" size="large" />
      </View>
    )
  }

  if (access === 'pending') {
    return (
      <View style={styles.container}>
        <View style={styles.pendingGlow} />
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.title}>Venue Application</Text>
        </View>
        <Reanimated.View entering={FadeInDown.delay(100).duration(500)} style={styles.pendingCard}>
          <View style={styles.pendingIconWrap}>
            <Ionicons name="time-outline" size={48} color="#f59e0b" />
          </View>
          <Text style={styles.pendingTitle}>Under Review</Text>
          <Text style={styles.pendingSub}>
            Your venue application is being reviewed by the HereNow team. We'll notify you as soon as you're approved — usually within 24–48 hours.
          </Text>
          <View style={styles.pendingDivider} />
          <Text style={styles.pendingHint}>
            Questions? Reach out at{' '}
            <Text style={styles.pendingEmail}>support@herenow.app</Text>
          </Text>
        </Reanimated.View>
        <Reanimated.View entering={FadeInDown.delay(250).duration(500)}>
          <TouchableOpacity style={styles.backHome} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.backHomeText}>Back to Home</Text>
          </TouchableOpacity>
        </Reanimated.View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.title}>Add a Venue</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Location */}
        <View style={styles.field}>
          <Text style={styles.label}>Location</Text>
          {locLoading ? (
            <View style={styles.locLoading}>
              <ActivityIndicator color="#29B6F6" size="small" />
              <Text style={styles.locLoadingText}>Getting your location...</Text>
            </View>
          ) : location ? (
            <>
              {/* Pin picker — drag to exact building location */}
              <PinPicker
                lat={location.lat}
                lng={location.lng}
                onChange={(lat, lng) => setLocation({ lat, lng })}
              />
              <View style={styles.locConfirm}>
                <Text style={styles.locConfirmText}>
                  📍 {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                </Text>
                <TouchableOpacity onPress={fetchLocation}>
                  <Text style={styles.locRefresh}>Reset to GPS</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={styles.locBtn} onPress={fetchLocation}>
              <Ionicons name="location-outline" size={18} color="#29B6F6" />
              <Text style={styles.locBtnText}>Use my location</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>
            {location
              ? 'Drag the pin or tap the map to place it on your building entrance.'
              : 'Start with your GPS position, then fine-tune on the map.'}
          </Text>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Venue Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. The 5 Spot, Frothy Monkey, Centennial Park"
            placeholderTextColor="#4A6580"
            maxLength={80}
          />
        </View>

        {/* Type */}
        <View style={styles.field}>
          <Text style={styles.label}>Venue Type</Text>
          <View style={styles.typeGrid}>
            {VENUE_TYPES.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.typeCard, type === v.id && styles.typeCardActive]}
                onPress={() => setType(type === v.id ? '' : v.id)}
              >
                <Text style={styles.typeEmoji}>{v.emoji}</Text>
                <Text style={[styles.typeLabel, type === v.id && styles.typeLabelActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={desc}
            onChangeText={setDesc}
            placeholder="What's unique about this spot?"
            placeholderTextColor="#4A6580"
            multiline
            maxLength={200}
          />
          <Text style={styles.charCount}>{desc.length}/200</Text>
        </View>

        {/* Radius */}
        <View style={styles.field}>
          <Text style={styles.label}>Zone Radius (meters)</Text>
          <TextInput
            style={styles.input}
            value={radius}
            onChangeText={(v) => setRadius(v.replace(/[^0-9]/g, ''))}
            placeholder="50"
            placeholderTextColor="#4A6580"
            keyboardType="numeric"
            maxLength={3}
          />
          <Text style={styles.hint}>
            Bar/restaurant: 15–25m. Park/outdoor space: 50–100m. Keep it tight — users should be inside or right at the door.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || !location || creating) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || !location || creating}
        >
          {creating
            ? <ActivityIndicator color="#050A15" />
            : (
              <>
                <Ionicons name="location" size={18} color="#050A15" />
                <Text style={styles.createBtnText}>Create Venue Zone</Text>
              </>
            )
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  pendingGlow: {
    position: 'absolute', top: -80, left: -60,
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: '#f59e0b', opacity: 0.04,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 22, paddingBottom: 60 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, color: '#4A6580', lineHeight: 16 },
  input: {
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    padding: 12,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#4A6580', textAlign: 'right' },
  locLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  locLoadingText: { color: '#7A93AC', fontSize: 13 },
  locConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#22c55e44',
  },
  locConfirmText: { fontSize: 13, color: '#22c55e', fontWeight: '600' },
  locRefresh: { fontSize: 12, color: '#7A93AC' },
  locBtn: {
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  locBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    minWidth: 80,
    gap: 4,
  },
  typeCardActive: { borderColor: '#29B6F6', backgroundColor: '#29B6F612' },
  typeEmoji: { fontSize: 20 },
  typeLabel: { fontSize: 11, color: '#7A93AC', fontWeight: '600' },
  typeLabelActive: { color: '#29B6F6' },
  createBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#050A15', fontWeight: '800', fontSize: 16 },

  // Pending state
  pendingCard: {
    margin: 24,
    marginTop: 40,
    backgroundColor: '#0D1B2E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#f59e0b22',
  },
  pendingIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#f59e0b10',
    borderWidth: 1, borderColor: '#f59e0b30',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  pendingTitle: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  pendingSub: { fontSize: 14, color: '#7A93AC', textAlign: 'center', lineHeight: 22, marginTop: 4 },
  pendingDivider: { width: 48, height: 1, backgroundColor: '#1A2E4A', marginVertical: 4 },
  pendingHint: { fontSize: 13, color: '#4A6580', textAlign: 'center' },
  pendingEmail: { color: '#29B6F6', fontWeight: '600' },
  backHome: {
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  backHomeText: { color: '#7A93AC', fontWeight: '700', fontSize: 15 },
})
