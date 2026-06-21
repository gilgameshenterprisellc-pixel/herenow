import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import * as Location from 'expo-location'
import { supabase } from '@/lib/supabase'

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
  const [name, setName]       = useState('')
  const [desc, setDesc]       = useState('')
  const [type, setType]       = useState('')
  const [radius, setRadius]   = useState('50')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchLocation()
  }, [])

  const fetchLocation = async () => {
    setLocLoading(true)
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Location required', 'HereNow needs your location to create a venue zone.')
      setLocLoading(false)
      return
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    setLocLoading(false)
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give this venue a name.')
      return
    }
    if (!location) {
      Alert.alert('Location required', 'Tap "Use my location" to set the zone center.')
      return
    }

    const radiusNum = parseInt(radius, 10)
    if (isNaN(radiusNum) || radiusNum < 10 || radiusNum > 500) {
      Alert.alert('Invalid radius', 'Radius must be between 10m and 500m.')
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
      })
      .select('id')
      .single()

    setCreating(false)

    if (error || !data) {
      Alert.alert('Failed to create venue', error?.message ?? 'Try again.')
      return
    }

    router.replace(`/zone/${data.id}`)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
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
            <View style={styles.locConfirm}>
              <Text style={styles.locConfirmText}>
                📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </Text>
              <TouchableOpacity onPress={fetchLocation}>
                <Text style={styles.locRefresh}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.locBtn} onPress={fetchLocation}>
              <Text style={styles.locBtnText}>📍 Use my location</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>The zone center is set to your current GPS position.</Text>
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
            How far from the center should count as "inside"? Small venue: 25–50m. Park/open space: 100–200m.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || !location || creating) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || !location || creating}
        >
          {creating
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.createBtnText}>Create Venue Zone 📍</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
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
    alignItems: 'center',
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
    marginTop: 8,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#050A15', fontWeight: '800', fontSize: 16 },
})
