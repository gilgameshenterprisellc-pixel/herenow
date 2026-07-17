import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView,
  Platform, TextInput,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { createEvent, updateEvent, fetchEventById } from '@/lib/events'
import { useToast } from '@/contexts/ToastContext'
import BackButton from '@/components/BackButton'

const EVENT_TYPES = [
  { id: 'music',      emoji: '🎵', label: 'Music' },
  { id: 'trivia',     emoji: '🧠', label: 'Trivia' },
  { id: 'happy_hour', emoji: '🍺', label: 'Happy Hour' },
  { id: 'sports',     emoji: '🏀', label: 'Sports' },
  { id: 'comedy',     emoji: '😂', label: 'Comedy' },
  { id: 'karaoke',    emoji: '🎤', label: 'Karaoke' },
  { id: 'general',    emoji: '📅', label: 'General' },
]

function formatDateTime(date: Date): string {
  return date.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type PickerTarget = 'start' | 'end' | null

export default function CreateEventScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const { zoneId, eventId, orgId } = useLocalSearchParams<{ zoneId: string; eventId?: string; orgId?: string }>()

  // With an eventId this screen becomes Edit Event — same form, prefilled,
  // saving via UPDATE instead of INSERT (Jacob: "allow permission to edit events").
  const isEditing = !!eventId

  const defaultStart = new Date(Date.now() + 60 * 60 * 1000)
  defaultStart.setMinutes(0, 0, 0)

  const [title, setTitle]         = useState('')
  const [desc, setDesc]           = useState('')
  const [eventType, setEventType] = useState('general')
  const [startDate, setStartDate] = useState<Date>(defaultStart)
  const [endDate, setEndDate]     = useState<Date | null>(null)
  const [hasEndDate, setHasEndDate] = useState(false)
  const [creating, setCreating]   = useState(false)
  const [loadingEvent, setLoadingEvent] = useState(isEditing)

  // Edit mode — load the existing event and prefill every field.
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    fetchEventById(eventId).then((ev) => {
      if (cancelled) return
      if (!ev) {
        showToast('Could not load that event.', 'error')
        router.canGoBack() ? router.back() : router.replace('/venue/events' as any)
        return
      }
      setTitle(ev.title)
      setDesc(ev.description ?? '')
      setEventType(ev.event_type ?? 'general')
      setStartDate(new Date(ev.starts_at))
      if (ev.ends_at) { setEndDate(new Date(ev.ends_at)); setHasEndDate(true) }
      setLoadingEvent(false)
    })
    return () => { cancelled = true }
  }, [eventId])

  // Picker state
  const [pickerTarget, setPickerTarget]       = useState<PickerTarget>(null)
  const [iosPendingDate, setIosPendingDate]   = useState<Date>(defaultStart)
  // Android two-step: pick date first, then time
  const [androidStep, setAndroidStep]         = useState<'date' | 'time'>('date')
  const [androidPendingDate, setAndroidPendingDate] = useState<Date>(defaultStart)

  const openPicker = (target: PickerTarget) => {
    const current = target === 'end'
      ? (endDate ?? new Date(startDate.getTime() + 2 * 60 * 60 * 1000))
      : startDate
    setPickerTarget(target)
    setIosPendingDate(current)
    setAndroidPendingDate(current)
    setAndroidStep('date')
  }

  const onPickerChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (_event.type !== 'set' || !selected) {
        setPickerTarget(null)
        setAndroidStep('date')
        return
      }
      if (androidStep === 'date') {
        setAndroidPendingDate(selected)
        setAndroidStep('time')
      } else {
        // Combine date from step 1 with time from step 2
        const combined = new Date(androidPendingDate)
        combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
        if (pickerTarget === 'start') setStartDate(combined)
        else { setEndDate(combined); setHasEndDate(true) }
        setPickerTarget(null)
        setAndroidStep('date')
      }
    } else {
      if (selected) setIosPendingDate(selected)
    }
  }

  const confirmIOSDate = () => {
    if (pickerTarget === 'start') setStartDate(iosPendingDate)
    else { setEndDate(iosPendingDate); setHasEndDate(true) }
    setPickerTarget(null)
  }

  const handleCreate = async () => {
    if (!isEditing && !zoneId) { showToast('Venue ID missing — go back and try again.', 'error'); return }
    if (!title.trim()) { showToast('Give your event a name.', 'error'); return }
    if (hasEndDate && endDate && endDate <= startDate) {
      showToast('End time must be after start time.', 'error'); return
    }

    setCreating(true)
    const payload = {
      title: title.trim(),
      description: desc.trim() || undefined,
      eventType,
      startsAt: startDate.toISOString(),
      endsAt: (hasEndDate && endDate) ? endDate.toISOString() : undefined,
    }
    const event = isEditing
      ? await updateEvent(eventId as string, payload)
      : await createEvent({ zoneId: zoneId as string, orgId: orgId || undefined, ...payload })
    setCreating(false)

    if (!event) { showToast('Could not save the event. Check your connection and try again.', 'error'); return }
    if (isEditing) showToast('Event updated.', 'success')
    router.canGoBack() ? router.back() : router.replace(`/zone/${zoneId ?? event.zone_id}` as any)
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace(`/zone/${zoneId}` as any)} />
        <Text style={styles.title}>{isEditing ? 'Edit Event' : 'Create Event'}</Text>
      </View>

      {loadingEvent ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : (
      <ScrollView
        keyboardDismissMode="on-drag"
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
          <TouchableOpacity style={styles.dateBtn} onPress={() => openPicker('start')}>
            <Text style={styles.dateBtnEmoji}>📅</Text>
            <Text style={styles.dateBtnText}>{formatDateTime(startDate)}</Text>
          </TouchableOpacity>
          {Platform.OS === 'android' && pickerTarget === 'start' && (
            <DateTimePicker
              value={androidStep === 'date' ? startDate : androidPendingDate}
              mode={androidStep}
              display="default"
              onChange={onPickerChange}
            />
          )}
          {Platform.OS === 'ios' && pickerTarget === 'start' && (
            <View style={styles.iosPickerInline}>
              <DateTimePicker
                value={iosPendingDate}
                mode="datetime"
                display="spinner"
                onChange={onPickerChange}
                themeVariant="dark"
              />
              <View style={styles.iosPickerActions}>
                <TouchableOpacity onPress={() => setPickerTarget(null)}>
                  <Text style={styles.pickerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIOSDate}>
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* End time */}
        <View style={styles.field}>
          <Text style={styles.label}>Ends At (optional)</Text>
          <TouchableOpacity
            style={[styles.dateBtn, !hasEndDate && styles.dateBtnMuted]}
            onPress={() => openPicker('end')}
          >
            <Text style={styles.dateBtnEmoji}>🏁</Text>
            <Text style={[styles.dateBtnText, !hasEndDate && styles.dateBtnTextMuted]}>
              {hasEndDate && endDate ? formatDateTime(endDate) : 'Tap to set end time'}
            </Text>
          </TouchableOpacity>
          {hasEndDate && (
            <TouchableOpacity onPress={() => { setHasEndDate(false); setEndDate(null) }}>
              <Text style={styles.clearEnd}>Remove end time</Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'android' && pickerTarget === 'end' && (
            <DateTimePicker
              value={androidStep === 'date'
                ? (endDate ?? new Date(startDate.getTime() + 2 * 60 * 60 * 1000))
                : androidPendingDate}
              mode={androidStep}
              display="default"
              onChange={onPickerChange}
            />
          )}
          {Platform.OS === 'ios' && pickerTarget === 'end' && (
            <View style={styles.iosPickerInline}>
              <DateTimePicker
                value={iosPendingDate}
                mode="datetime"
                display="spinner"
                onChange={onPickerChange}
                themeVariant="dark"
              />
              <View style={styles.iosPickerActions}>
                <TouchableOpacity onPress={() => setPickerTarget(null)}>
                  <Text style={styles.pickerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIOSDate}>
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.createBtn, (!title.trim() || creating) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!title.trim() || creating}
        >
          {creating
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.createBtnText}>{isEditing ? 'Save Changes' : 'Create Event 📅'}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
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
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#29B6F6',
  },
  dateBtnMuted: { borderColor: '#1A2E4A' },
  dateBtnEmoji: { fontSize: 18 },
  dateBtnText: { fontSize: 15, color: '#f8fafc', fontWeight: '600', flex: 1 },
  dateBtnTextMuted: { color: '#4A6580', fontWeight: '400' },
  clearEnd: { fontSize: 12, color: '#ef4444', textAlign: 'right', paddingRight: 4 },
  createBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#050A15', fontWeight: '800', fontSize: 16 },

  // iOS inline picker (replaces old Modal-based sheet — eliminates touch-capture issues)
  iosPickerInline: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    overflow: 'hidden',
    marginTop: 4,
  },
  iosPickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1A2E4A',
  },
  pickerCancelText: { fontSize: 15, color: '#7A93AC' },
  pickerDoneText: { fontSize: 15, fontWeight: '700', color: '#29B6F6' },
})
