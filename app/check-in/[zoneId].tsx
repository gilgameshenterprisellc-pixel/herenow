import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionContext } from '@/contexts/SessionContext'
import type { SocialMode, MoodMode } from '@/lib/sessions'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { checkAndAwardBadges } from '@/lib/badges'

const SOCIAL_MODES: { mode: SocialMode; emoji: string; label: string; desc: string; color: string }[] = [
  {
    mode:  'dating',
    emoji: '💘',
    label: 'Dating',
    desc:  'Open to romantic connection — IRL, no pressure',
    color: '#f43f5e',
  },
  {
    mode:  'friends',
    emoji: '🤝',
    label: 'Friends',
    desc:  'Here to socialize and meet new people',
    color: '#22c55e',
  },
  {
    mode:  'networking',
    emoji: '💼',
    label: 'Networking',
    desc:  'Creative or professional connections',
    color: '#3b82f6',
  },
  {
    mode:  'just_vibes',
    emoji: '✌️',
    label: 'Just Vibes',
    desc:  "Here for the energy, not for meeting people",
    color: '#a855f7',
  },
]

const MOOD_MODES: { mode: MoodMode; emoji: string; label: string; desc: string; color: string }[] = [
  {
    mode:  'open',
    emoji: '🟢',
    label: 'Open',
    desc:  'Come say hi — I\'m happy to meet people',
    color: '#22c55e',
  },
  {
    mode:  'selective',
    emoji: '🟡',
    label: 'Selective',
    desc:  'Open but want quality over quantity',
    color: '#29B6F6',
  },
  {
    mode:  'not_today',
    emoji: '🛡️',
    label: 'Not Today',
    desc:  'Please don\'t approach me right now',
    color: '#7A93AC',
  },
]

export default function CheckInScreen() {
  const insets = useSafeAreaInsets()
  const { zoneId } = useLocalSearchParams<{ zoneId: string }>()
  const [zoneName, setZoneName]     = useState('')
  const [socialMode, setSocialMode] = useState<SocialMode | null>(null)
  const [moodMode, setMoodMode]     = useState<MoodMode>('selective')
  const [loading, setLoading]       = useState(false)

  const { checkIn, activeSession } = useSessionContext()
  const { showToast } = useToast()

  useEffect(() => {
    supabase.from('zones').select('name').eq('id', zoneId).maybeSingle()
      .then(({ data }) => setZoneName(data?.name ?? ''))
  }, [zoneId])

  const handleCheckIn = async () => {
    if (!socialMode) {
      showToast('Choose a Social Mode to let others know what you\'re here for.', 'info')
      return
    }

    if (activeSession && activeSession.zone_id !== zoneId) {
      platformConfirm(
        'Already checked in',
        'You\'ll be checked out of your current venue first.',
        doCheckIn,
        { confirmText: 'Continue' }
      )
      return
    }

    doCheckIn()
  }

  const doCheckIn = async () => {
    setLoading(true)
    const result = await checkIn(zoneId, socialMode!, moodMode)
    setLoading(false)

    if (!result.ok) {
      if (result.reason === 'not_in_zone') {
        showToast("You're not at this venue yet — check in once you arrive.", 'error')
      } else if (result.reason === 'location_unavailable') {
        showToast('Turn on location access to check in.', 'error')
      } else {
        showToast('Check-in failed — something went wrong. Try again.', 'error')
      }
      return
    }

    await checkAndAwardBadges('checkin')
    router.replace(`/zone/${zoneId}`)
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Check In</Text>
          {zoneName ? <Text style={styles.zoneName}>📍 {zoneName}</Text> : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Social Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What are you here for?</Text>
          <Text style={styles.sectionSub}>
            This tells others your intent. Be honest — it prevents misread situations.
          </Text>
          <View style={styles.options}>
            {SOCIAL_MODES.map((s) => {
              const active = socialMode === s.mode
              return (
                <TouchableOpacity
                  key={s.mode}
                  style={[styles.option, active && { borderColor: s.color, backgroundColor: s.color + '12' }]}
                  onPress={() => setSocialMode(s.mode)}
                  activeOpacity={0.8}
                >
                  <View style={styles.optionTop}>
                    <Text style={styles.optionEmoji}>{s.emoji}</Text>
                    <Text style={[styles.optionLabel, active && { color: s.color }]}>{s.label}</Text>
                    {active && (
                      <View style={[styles.checkDot, { backgroundColor: s.color }]}>
                        <Text style={styles.checkDotText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.optionDesc}>{s.desc}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Mood Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How are you feeling?</Text>
          <Text style={styles.sectionSub}>
            Sets your comfort level. Not Today is a hard boundary — no one can approach you.
          </Text>
          <View style={styles.moodRow}>
            {MOOD_MODES.map((m) => {
              const active = moodMode === m.mode
              return (
                <TouchableOpacity
                  key={m.mode}
                  style={[
                    styles.moodOption,
                    active && { borderColor: m.color, backgroundColor: m.color + '12' },
                  ]}
                  onPress={() => setMoodMode(m.mode)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text style={[styles.moodLabel, active && { color: m.color }]}>{m.label}</Text>
                  <Text style={styles.moodDesc} numberOfLines={2}>{m.desc}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyText}>
            🔒 Only visible to people checked in to the same venue at the same time. Disappears when you leave.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.checkInBtn, (!socialMode || loading) && styles.checkInBtnDisabled]}
          onPress={handleCheckIn}
          disabled={!socialMode || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.checkInBtnText}>I'm Here 📍</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  zoneName: { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 28, paddingBottom: 40 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  sectionSub: { fontSize: 13, color: '#7A93AC', lineHeight: 18 },
  options: { gap: 10 },
  option: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: '#1A2E4A',
    gap: 6,
  },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionEmoji: { fontSize: 22 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: '#f8fafc', flex: 1 },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  optionDesc: { fontSize: 13, color: '#7A93AC', lineHeight: 17, paddingLeft: 32 },
  moodRow: { flexDirection: 'row', gap: 8 },
  moodOption: {
    flex: 1,
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: '#1A2E4A',
    gap: 4,
    alignItems: 'center',
  },
  moodEmoji: { fontSize: 22 },
  moodLabel: { fontSize: 13, fontWeight: '700', color: '#f8fafc', textAlign: 'center' },
  moodDesc: { fontSize: 11, color: '#7A93AC', textAlign: 'center', lineHeight: 14 },
  privacyNote: {
    backgroundColor: '#0D1B2E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  privacyText: { fontSize: 12, color: '#7A93AC', lineHeight: 17, textAlign: 'center' },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0D1B2E',
  },
  checkInBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkInBtnDisabled: { opacity: 0.4 },
  checkInBtnText: { fontSize: 17, fontWeight: '800', color: '#050A15' },
})
