import { useState } from 'react'
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'beta_feedback_shown_date'

export async function shouldShowBetaFeedback(): Promise<boolean> {
  try {
    const lastShown = await AsyncStorage.getItem(STORAGE_KEY)
    if (!lastShown) return true
    return lastShown !== new Date().toDateString()
  } catch {
    return false
  }
}

export async function markBetaFeedbackShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, new Date().toDateString())
  } catch {}
}

type Rating = 'smooth' | 'issues' | 'broken'

const RATINGS: { value: Rating; emoji: string; label: string }[] = [
  { value: 'smooth', emoji: '', label: 'Smooth' },
  { value: 'issues', emoji: '', label: 'Had Issues' },
  { value: 'broken', emoji: '', label: 'Broken' },
]

interface Props {
  visible: boolean
  zoneId: string
  onDismiss: () => void
}

export default function BetaFeedbackModal({ visible, zoneId, onDismiss }: Props) {
  const [rating, setRating] = useState<Rating | null>(null)
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!rating) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('beta_feedback').insert({
        user_id: user?.id ?? null,
        zone_id: zoneId,
        rating,
        note: note.trim() || null,
      })
    } catch {}
    setSaving(false)
    onDismiss()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>BETA FEEDBACK</Text>
          </View>

          <Text style={styles.title}>How was the check-in?</Text>
          <Text style={styles.sub}>5 seconds. Helps us fix bugs fast.</Text>

          <View style={styles.ratingRow}>
            {RATINGS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.ratingBtn, rating === r.value && styles.ratingBtnActive]}
                onPress={() => setRating(r.value)}
                activeOpacity={0.75}
              >
                <Text style={styles.ratingEmoji}>{r.emoji}</Text>
                <Text style={[styles.ratingLabel, rating === r.value && styles.ratingLabelActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="Anything specific? (optional)"
            placeholderTextColor="#4A6580"
            maxLength={200}
            multiline
            numberOfLines={2}
          />

          <View style={styles.actions}>
            <TouchableOpacity onPress={onDismiss} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              style={[styles.submitBtn, !rating && styles.submitBtnDisabled]}
              disabled={!rating || saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#050A15" size="small" />
                : <Text style={styles.submitText}>Send Feedback</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,10,21,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 16,
  },
  betaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#29B6F620',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#29B6F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  betaBadgeText: { fontSize: 10, fontWeight: '800', color: '#29B6F6', letterSpacing: 1.2 },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  sub:   { fontSize: 13, color: '#7A93AC', marginTop: -8 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtn: {
    flex: 1,
    backgroundColor: '#0A1628',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: '#1A2E4A',
  },
  ratingBtnActive: { borderColor: '#29B6F6', backgroundColor: '#29B6F612' },
  ratingEmoji:      { fontSize: 22 },
  ratingLabel:      { fontSize: 11, fontWeight: '700', color: '#7A93AC' },
  ratingLabelActive: { color: '#29B6F6' },
  input: {
    backgroundColor: '#0A1628',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    padding: 12,
    color: '#f8fafc',
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  skipBtn:  { paddingHorizontal: 12, paddingVertical: 10 },
  skipText: { fontSize: 14, color: '#4A6580' },
  submitBtn: {
    flex: 1,
    backgroundColor: '#29B6F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontSize: 14, fontWeight: '800', color: '#050A15' },
})
