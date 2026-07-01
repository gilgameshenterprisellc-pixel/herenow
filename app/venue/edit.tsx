import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView,
  Modal,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

const RADIUS_OPTIONS = [
  { label: 'Small (bar, coffee shop)', meters: 80 },
  { label: 'Medium (restaurant, gym)', meters: 150 },
  { label: 'Large (venue, event space)', meters: 300 },
]

const ALL_CHIPS = [
  'Cocktails', 'Draft Beer', 'Wine Bar', 'Full Menu', 'Late Night Bites',
  'Live Music', 'DJ', 'Karaoke', 'Trivia Night', 'Sports TV',
  'Billiards', 'Patio', 'Dance Floor', 'Rooftop',
  'Happy Hour', '21+', 'Dog Friendly', 'Reservations',
]

// ── Hours picker helpers ────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
type Day = typeof DAYS[number]
interface DaySchedule { open: boolean; from: string; to: string }
type WeekSchedule = Record<Day, DaySchedule>

const DEFAULT_SCHEDULE: WeekSchedule = DAYS.reduce(
  (acc, d) => ({ ...acc, [d]: { open: false, from: '17:00', to: '02:00' } }),
  {} as WeekSchedule,
)

function fmt12(time: string): string {
  const [hStr, mStr] = time.split(':')
  let h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m.toString().padStart(2, '0')} ${period}`
}

function timeToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function dateToTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function buildHoursText(sched: WeekSchedule): string | null {
  const openSegs: Array<{ days: Day[]; from: string; to: string }> = []
  for (const day of DAYS) {
    if (!sched[day].open) continue
    const last = openSegs[openSegs.length - 1]
    const idx = DAYS.indexOf(day)
    const lastIdx = last ? DAYS.indexOf(last.days[last.days.length - 1]) : -1
    if (last && last.from === sched[day].from && last.to === sched[day].to && idx === lastIdx + 1) {
      last.days.push(day)
    } else {
      openSegs.push({ days: [day], from: sched[day].from, to: sched[day].to })
    }
  }
  if (openSegs.length === 0) return null

  const parts = openSegs.map((seg) => {
    const label = seg.days.length === 1
      ? seg.days[0]
      : `${seg.days[0]}–${seg.days[seg.days.length - 1]}`
    return `${label} ${fmt12(seg.from)}–${fmt12(seg.to)}`
  })

  const closedDays = DAYS.filter((d) => !sched[d].open)
  if (closedDays.length > 0 && closedDays.length < 7) {
    const closedSegs: Day[][] = []
    for (const day of closedDays) {
      const last = closedSegs[closedSegs.length - 1]
      const idx = DAYS.indexOf(day)
      const lastIdx = last ? DAYS.indexOf(last[last.length - 1]) : -1
      if (last && idx === lastIdx + 1) last.push(day)
      else closedSegs.push([day])
    }
    closedSegs.forEach((seg) => {
      const label = seg.length === 1 ? seg[0] : `${seg[0]}–${seg[seg.length - 1]}`
      parts.push(`Closed ${label}`)
    })
  }

  return parts.join(' · ')
}

// Pre-built time options for web picker (6 AM → 5:30 AM next day, 30-min slots)
const WEB_TIMES: string[] = (() => {
  const t: string[] = []
  for (let h = 6; h < 30; h++) {
    const hh = h % 24
    t.push(`${hh.toString().padStart(2, '0')}:00`)
    t.push(`${hh.toString().padStart(2, '0')}:30`)
  }
  return t
})()

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
  const { showToast } = useToast()
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [locating, setLocating]   = useState(false)
  const [userId, setUserId]       = useState<string | null>(null)
  const [existingZone, setExistingZone] = useState<VenueZone | null>(null)
  const [previousHours, setPreviousHours] = useState<string | null>(null)

  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [schedule, setSchedule]       = useState<WeekSchedule>({ ...DEFAULT_SCHEDULE })
  const [lat, setLat]               = useState<number | null>(null)
  const [lng, setLng]               = useState<number | null>(null)
  const [radius, setRadius]         = useState(RADIUS_OPTIONS[0].meters)
  const [chips, setChips]           = useState<string[]>([])

  // Time picker state
  type TimeTarget = { day: Day; field: 'from' | 'to' }
  const [timeTarget, setTimeTarget]     = useState<TimeTarget | null>(null)
  const [iosPendingTime, setIosPendingTime] = useState('17:00')
  const [webPickerOpen, setWebPickerOpen]   = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }
      setUserId(user.id)

      const { data: zones } = await supabase
        .from('zones')
        .select('id, name, description, center_lat, center_lng, radius_meters, chips, opening_hours')
        .eq('owner_id', user.id)
        .limit(1)

      const z = zones?.[0] ?? null
      if (z) {
        setExistingZone(z)
        setName(z.name)
        setDescription(z.description ?? '')
        const existingHours = (z as any).opening_hours ?? null
        if (existingHours) setPreviousHours(existingHours)
        setLat(z.center_lat)
        setLng(z.center_lng)
        setRadius(z.radius_meters)
        setChips((z as any).chips ?? [])
      } else {
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
          showToast('Geolocation is not available in this browser.', 'error')
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
          showToast('Location access is needed to pin your venue.', 'error')
          return
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
      }
    } catch (err: any) {
      showToast(err?.message ?? 'Could not get location. Make sure location access is allowed.', 'error')
    } finally {
      setLocating(false)
    }
  }

  // Open time picker
  const openTimePicker = (day: Day, field: 'from' | 'to') => {
    setIosPendingTime(schedule[day][field])
    setTimeTarget({ day, field })
    if (Platform.OS === 'web') setWebPickerOpen(true)
  }

  // iOS confirm
  const confirmIosTime = () => {
    if (!timeTarget) return
    setSchedule((prev) => ({
      ...prev,
      [timeTarget.day]: { ...prev[timeTarget.day], [timeTarget.field]: iosPendingTime },
    }))
    setTimeTarget(null)
  }

  // Android time change
  const onAndroidTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (!timeTarget) return
    if (_event.type !== 'set' || !selected) { setTimeTarget(null); return }
    setSchedule((prev) => ({
      ...prev,
      [timeTarget.day]: { ...prev[timeTarget.day], [timeTarget.field]: dateToTime(selected) },
    }))
    setTimeTarget(null)
  }

  // Web time select
  const selectWebTime = (time: string) => {
    if (!timeTarget) return
    setSchedule((prev) => ({
      ...prev,
      [timeTarget.day]: { ...prev[timeTarget.day], [timeTarget.field]: time },
    }))
    setWebPickerOpen(false)
    setTimeTarget(null)
  }

  const handleSave = async () => {
    if (!name.trim()) { showToast('Venue name required.', 'error'); return }
    if (lat === null || lng === null) {
      showToast('Tap "Use My Location" while you\'re standing at your venue to set the pin.', 'error')
      return
    }
    if (!userId) return

    setSaving(true)

    const openingHours = buildHoursText(schedule)
    const centerWkt = `POINT(${lng} ${lat})`

    if (existingZone) {
      const { error } = await supabase
        .from('zones')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          opening_hours: openingHours,
          center: centerWkt,
          center_lat: lat,
          center_lng: lng,
          radius_meters: radius,
          chips,
        })
        .eq('id', existingZone.id)

      setSaving(false)
      if (error) { showToast(error.message ?? 'Save failed. Try again.', 'error'); return }
    } else {
      const { error } = await supabase
        .from('zones')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          opening_hours: openingHours,
          center: centerWkt,
          center_lat: lat,
          center_lng: lng,
          radius_meters: radius,
          chips,
          created_by: userId,
          owner_id: userId,
          is_active: true,
        })

      setSaving(false)
      if (error) { showToast(error.message ?? 'Save failed. Try again.', 'error'); return }
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
  const hoursPreview = buildHoursText(schedule)

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
        {/* Location */}
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

        {/* Operating Hours — day-by-day picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Operating Hours</Text>

          {previousHours && !hoursPreview && (
            <View style={styles.prevHoursNote}>
              <Text style={styles.prevHoursLabel}>Currently saved:</Text>
              <Text style={styles.prevHoursText}>{previousHours}</Text>
              <Text style={styles.prevHoursHint}>Toggle days below to update your schedule.</Text>
            </View>
          )}

          <View style={styles.scheduleGrid}>
            {DAYS.map((day) => {
              const d = schedule[day]
              return (
                <View key={day} style={styles.dayRow}>
                  {/* Day label */}
                  <Text style={styles.dayLabel}>{day}</Text>

                  {/* Toggle */}
                  <TouchableOpacity
                    style={[styles.dayToggle, d.open && styles.dayToggleOn]}
                    onPress={() =>
                      setSchedule((prev) => ({
                        ...prev,
                        [day]: { ...prev[day], open: !prev[day].open },
                      }))
                    }
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dayToggleThumb, d.open && styles.dayToggleThumbOn]} />
                  </TouchableOpacity>

                  {/* Times or Closed label */}
                  {d.open ? (
                    <View style={styles.dayTimes}>
                      <TouchableOpacity
                        style={styles.timeBtn}
                        onPress={() => openTimePicker(day, 'from')}
                      >
                        <Text style={styles.timeBtnText}>{fmt12(d.from)}</Text>
                      </TouchableOpacity>
                      <Text style={styles.timeSep}>→</Text>
                      <TouchableOpacity
                        style={styles.timeBtn}
                        onPress={() => openTimePicker(day, 'to')}
                      >
                        <Text style={styles.timeBtnText}>{fmt12(d.to)}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.closedLabel}>Closed</Text>
                  )}
                </View>
              )
            })}
          </View>

          {/* Live preview */}
          {hoursPreview ? (
            <View style={styles.hoursPreview}>
              <Text style={styles.hoursPreviewText}>🕐 {hoursPreview}</Text>
            </View>
          ) : null}

          {/* iOS inline time picker */}
          {timeTarget !== null && Platform.OS === 'ios' && (
            <View style={styles.iosPickerInline}>
              <DateTimePicker
                value={timeToDate(schedule[timeTarget.day][timeTarget.field])}
                mode="time"
                display="spinner"
                onChange={(_, d) => d && setIosPendingTime(dateToTime(d))}
                themeVariant="dark"
              />
              <View style={styles.iosPickerActions}>
                <TouchableOpacity onPress={() => setTimeTarget(null)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIosTime}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Android native time picker */}
          {timeTarget !== null && Platform.OS === 'android' && (
            <DateTimePicker
              value={timeToDate(schedule[timeTarget.day][timeTarget.field])}
              mode="time"
              display="default"
              onChange={onAndroidTimeChange}
            />
          )}

          <Text style={styles.sectionHint}>Shown on your venue card so guests know when you're open.</Text>
        </View>

        {/* Venue Chips */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Venue Vibes</Text>
          <Text style={styles.sectionHint}>
            Tag what makes your spot unique — shown on your venue card and in search.
          </Text>
          <View style={styles.chipsGrid}>
            {ALL_CHIPS.map((chip) => {
              const active = chips.includes(chip)
              return (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chipPill, active && styles.chipPillActive]}
                  onPress={() => setChips((prev) =>
                    prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
                  )}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            🔒 Users only see that a venue exists and how many people are checked in.
            Their individual profiles are only visible to other checked-in guests — never to you as the venue owner.
          </Text>
        </View>
      </ScrollView>

      {/* Web time picker modal */}
      {Platform.OS === 'web' && (
        <Modal
          visible={webPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => { setWebPickerOpen(false); setTimeTarget(null) }}
        >
          <TouchableOpacity
            style={styles.webOverlay}
            activeOpacity={1}
            onPress={() => { setWebPickerOpen(false); setTimeTarget(null) }}
          >
            <View style={styles.webPickerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.webPickerTitle}>
                {timeTarget
                  ? `${timeTarget.day} — ${timeTarget.field === 'from' ? 'Open' : 'Close'}`
                  : 'Select Time'}
              </Text>
              <ScrollView style={styles.webTimeList} showsVerticalScrollIndicator={false}>
                {WEB_TIMES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.webTimeRow,
                      timeTarget && schedule[timeTarget.day][timeTarget.field] === t && styles.webTimeRowActive,
                    ]}
                    onPress={() => selectWebTime(t)}
                  >
                    <Text style={[
                      styles.webTimeText,
                      timeTarget && schedule[timeTarget.day][timeTarget.field] === t && styles.webTimeTextActive,
                    ]}>
                      {fmt12(t)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.webPickerCancel}
                onPress={() => { setWebPickerOpen(false); setTimeTarget(null) }}
              >
                <Text style={styles.webPickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
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
  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipPill: {
    backgroundColor: '#0D1B2E', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  chipPillActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  chipText:       { fontSize: 13, color: '#7A93AC', fontWeight: '600' },
  chipTextActive: { color: '#29B6F6', fontWeight: '700' },
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

  // Previous hours notice
  prevHoursNote: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#1A3A50', gap: 2,
  },
  prevHoursLabel: { fontSize: 11, color: '#4A6580', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  prevHoursText:  { fontSize: 13, color: '#8EADC7', fontWeight: '600' },
  prevHoursHint:  { fontSize: 11, color: '#4A6580', marginTop: 2 },

  // Day-by-day schedule grid
  scheduleGrid: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0A1525',
    gap: 10,
  },
  dayLabel: {
    fontSize: 14, fontWeight: '700', color: '#8EADC7',
    width: 32,
  },
  // Toggle switch
  dayToggle: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: '#1A2E4A',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  dayToggleOn: { backgroundColor: '#29B6F630' },
  dayToggleThumb: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#3A5C7A',
    alignSelf: 'flex-start',
  },
  dayToggleThumbOn: {
    backgroundColor: '#29B6F6',
    alignSelf: 'flex-end',
  },
  // Time buttons
  dayTimes: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeBtn: {
    backgroundColor: '#0A1525', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#29B6F640',
  },
  timeBtnText: { fontSize: 12, fontWeight: '700', color: '#29B6F6' },
  timeSep: { fontSize: 11, color: '#4A6580' },
  closedLabel: { flex: 1, fontSize: 13, color: '#2A3F55', fontStyle: 'italic' },

  // Hours preview
  hoursPreview: {
    backgroundColor: '#061020', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  hoursPreviewText: { fontSize: 12, color: '#8EADC7', lineHeight: 17 },

  // iOS inline picker
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
  pickerCancel: { fontSize: 15, color: '#7A93AC' },
  pickerDone:   { fontSize: 15, fontWeight: '700', color: '#29B6F6' },

  // Web time picker modal
  webOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  webPickerCard: {
    backgroundColor: '#0D1B2E', borderRadius: 16, width: 220,
    borderWidth: 1, borderColor: '#1A2E4A', overflow: 'hidden',
    maxHeight: 400,
  },
  webPickerTitle: {
    fontSize: 13, fontWeight: '800', color: '#8EADC7',
    textAlign: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1A2E4A',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  webTimeList: { maxHeight: 280 },
  webTimeRow: {
    paddingVertical: 11, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#0A1525',
  },
  webTimeRowActive: { backgroundColor: '#29B6F618' },
  webTimeText: { fontSize: 14, color: '#8EADC7', textAlign: 'center' },
  webTimeTextActive: { color: '#29B6F6', fontWeight: '700' },
  webPickerCancel: {
    paddingVertical: 12, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#1A2E4A',
  },
  webPickerCancelText: { fontSize: 14, color: '#7A93AC' },

  infoCard: {
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  infoText: { fontSize: 12, color: '#4A6580', lineHeight: 17, textAlign: 'center' },
})
