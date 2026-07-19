import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useToast } from '@/contexts/ToastContext'
import BackButton from '@/components/BackButton'
import { getCurrentCoords } from '@/lib/location'
import { submitVenue } from '@/lib/venueSubmissions'
import { successBuzz } from '@/lib/haptics'

const CATEGORIES = [
  'Bar', 'Cocktail Lounge', 'Restaurant', 'Coffee Shop', 'Brewery',
  'Music Venue', 'Club', 'Cafe', 'Park', 'Gym', 'Coworking', 'Other',
]

export default function SubmitVenueScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [name, setName]             = useState('')
  const [category, setCategory]     = useState<string | null>(null)
  const [address, setAddress]       = useState('')
  const [contact, setContact]       = useState('')
  const [note, setNote]             = useState('')
  const [coords, setCoords]         = useState<{ latitude: number; longitude: number } | null>(null)
  const [locating, setLocating]     = useState(false)
  const [saving, setSaving]         = useState(false)

  const useMyLocation = async () => {
    setLocating(true)
    const c = await getCurrentCoords()
    setLocating(false)
    if (c) {
      setCoords(c)
      showToast('Location captured. Thanks!', 'success')
    } else {
      showToast('Could not get your location. You can enter an address instead.', 'error')
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) { showToast('Enter the venue name.', 'error'); return }
    if (!coords && !address.trim()) {
      showToast('Add a location — use your current spot or type the address.', 'error')
      return
    }
    setSaving(true)
    const ok = await submitVenue({
      name,
      category,
      address:   address || null,
      latitude:  coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      venueContact: contact || null,
      note,
    })
    setSaving(false)
    if (ok) {
      successBuzz()
      showToast("Thanks! We'll review it and reach out to the venue.", 'success')
      router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)
    } else {
      showToast('Could not submit. Try again.', 'error')
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)} />
        <Text style={styles.title}>Suggest a Venue</Text>
      </View>

      <ScrollView
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 600, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hint}>
          Know a spot that should be on HereNow? Tell us and we'll invite them. If it's your venue, you can claim it once it's live.
        </Text>

        <Text style={styles.label}>Venue name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. The Rooftop Lounge"
          placeholderTextColor="#4A6580"
          maxLength={80}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, category === c && styles.chipOn]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Location *</Text>
        <TouchableOpacity style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
          {locating
            ? <ActivityIndicator color="#29B6F6" size="small" />
            : <Text style={styles.locBtnText}>{coords ? '✓ Using my current location' : 'Use my current location'}</Text>}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="…or type the address"
          placeholderTextColor="#4A6580"
          maxLength={160}
        />

        <Text style={styles.label}>Venue contact <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          value={contact}
          onChangeText={setContact}
          placeholder="Email or phone, so we can reach them"
          placeholderTextColor="#4A6580"
          autoCapitalize="none"
          maxLength={120}
        />

        <Text style={styles.label}>Anything else? <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={note}
          onChangeText={setNote}
          placeholder="Why it'd be great on HereNow…"
          placeholderTextColor="#4A6580"
          multiline
          maxLength={280}
        />

        <TouchableOpacity
          style={[styles.submitBtn, (!name.trim() || saving) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!name.trim() || saving}
        >
          {saving
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.submitBtnText}>Submit suggestion</Text>}
        </TouchableOpacity>
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
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  content: { padding: 16, gap: 10, paddingBottom: 60 },
  hint: { fontSize: 13, color: '#7A93AC', lineHeight: 19, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', color: '#8EADC7', marginTop: 8 },
  optional: { color: '#4A6580', fontWeight: '400' },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: '#f8fafc', fontSize: 15, borderWidth: 1, borderColor: '#1A2E4A',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  chipOn: { borderColor: '#29B6F6', backgroundColor: '#29B6F620' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#7A93AC' },
  chipTextOn: { color: '#29B6F6' },
  locBtn: {
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#29B6F640',
  },
  locBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 14 },
  submitBtn: {
    backgroundColor: '#29B6F6', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15 },
})
