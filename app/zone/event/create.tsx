import { useState } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { createEvent } from '@/lib/events'

const EVENT_TYPES = [
  { id: 'music',      emoji: '🎵', label: 'Music' },
  { id: 'trivia',     emoji: '🧠', label: 'Trivia' },
  { id: 'happy_hour', emoji: '🍺', label: 'Happy Hour' },
  { id: 'sports',     emoji: '🏀', label: 'Sports' },
  { id: 'comedy',     emoji: '😂', label: 'Comedy' },
  { id: 'karaoke',    emoji: '🎤', label: 'Karaoke' },
  { id: 'general',    emoji: '📅', label: 'General' },
]

function getDefaultStart(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"
}

function localToISO(localStr: string): string | null {
  // Accepts "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD HH:MM"
  const cleaned = localStr.replace(' ', 'T')
  const d = new Date(cleaned)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function friendlyDate(isoLocal: string): string {
  const cleaned = isoLocal.replace('T', ' ')
  const d = new Date(isoLocal)
  if (isNaN(d.getTime())) return isoLocal
  return d.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CreateEventScreen() {
  const { zoneId }        = useLocalSearchParams<{ zoneId: string }>()
  const [title, setTitle] = useState('')
  const [desc, setDesc]   = useState('')
  const [eventType, setEventType] = useState('general')
  const [startsAt, setStartsAt]   = useState(getDefaultStart())
  const [endsAt, setEndsAt]       = useState('')
  const [creating, setCreating]   = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Give your event a name.')
      return
    }

    const startISO = localToISO(startsAt)
    if (!startISO) {
      Alert.alert('Invalid start time', 'Use format: YYYY-MM-DDTHH:MM (e.g. 2026-06-17T20:00)')
      return
    }

    let endISO: string | undefined
    if (endsAt.trim()) {
      const parsed = localToISO(endsAt)
      if (!parsed) {
        Alert.alert('Invalid end time', 'Use format: YYYY-MM-DDTHH:MM')
        return
      }
      if (new Date(parsed) <= new Date(startISO)) {
        Alert.alert('Invalid time', 'End time must be after start time.')
        return
      }
      endISO = parsed
    }

    setCreating(true)
    const event = await createEvent({
      zoneId,
      title: title.trim(),
      description: desc.trim() || undefined,
      eventType,
      startsAt: startISO,
      endsAt: endISO,
    })
    setCreating(false)

    if (!event) {
      Alert.alert('Failed', 'Could not create the event. Try again.')
      return
    }

    router.back()
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Event</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type */}
        <View style={styles.field}>
          <Text style={styles.label}>Event Type</Text>
          <View style={styles.typeGrid}>
            {EVENT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeCard, eventType === t.id && styles.typeCardActive]}
                onPress={() => setEventType(t.id)}
              >
                <Text style={styles.typeEmoji}>{t.emoji}</Text>
                <Text style={[styles.typeLabel, eventType === t.id && styles.typeLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Trivia Night, Open Mic, Happy Hour"
            placeholderTextColor="#4A6580"
            maxLength={80}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={desc}
            onChangeText={setDesc}
            placeholder="What should people know?"
            placeholderTextColor="#4A6580"
            multiline
            maxLength={300}
          />
        </View>

        {/* Start time */}
        <View style={styles.field}>
          <Text style={styles.label}>Starts At *</Text>
          <TextInput
            style={styles.input}
            value={startsAt}
            onChangeText={setStartsAt}
            placeholder="YYYY-MM-DDTHH:MM"
            placeholderTextColor="#4A6580"
            autoCapitalize="none"
          />
          {startsAt && localToISO(startsAt) && (
            <Text style={styles.preview}>📅 {friendlyDate(startsAt)}</Text>
          )}
        </View>

        {/* End time */}
        <View style={styles.field}>
          <Text style={styles.label}>Ends At (optional)</Text>
          <TextInput
            style={styles.input}
            value={endsAt}
            onChangeText={setEndsAt}
            placeholder="YYYY-MM-DDTHH:MM"
            placeholderTextColor="#4A6580"
            autoCapitalize="none"
          />
          {endsAt && localToISO(endsAt) && (
            <Text style={styles.preview}>📅 {friendlyDate(endsAt)}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.createBtn, (!title.trim() || creating) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!title.trim() || creating}
        >
          {creating
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.createBtnText}>Create Event 📅</Text>
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
  content: { padding: 16, gap: 20, paddingBottom: 60 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  preview: { fontSize: 12, color: '#29B6F6', fontWeight: '600' },
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
  typeEmoji: { fontSize: 18 },
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
