import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import {
  SURVEY_QUESTIONS, REQUIRED_IDS, submitSurvey,
  type SurveyAnswers, type SurveyQuestion,
} from '@/lib/survey'

export default function SurveyScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [answers, setAnswers] = useState<SurveyAnswers>({})
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  const setAnswer = (id: string, value: string | number) =>
    setAnswers((prev) => ({ ...prev, [id]: value }))

  const requiredMet = REQUIRED_IDS.every((id) => answers[id] !== undefined && answers[id] !== '')

  const handleSubmit = async () => {
    if (!requiredMet) {
      showToast('Please answer the rating and likelihood questions to submit.', 'info')
      return
    }
    // Drop empty text answers so blank fields don't clutter the results.
    const cleaned: SurveyAnswers = {}
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === 'string' && v.trim() === '') continue
      cleaned[k] = v
    }
    setSaving(true)
    const res = await submitSurvey(cleaned)
    setSaving(false)
    if (!res.ok) { showToast('Could not submit — try again.', 'error'); return }
    setDone(true)
  }

  if (done) {
    return (
      <View style={styles.container}>
        <View style={[styles.doneWrap, { paddingTop: insets.top }]}>
          <Text style={styles.doneEmoji}>🙏</Text>
          <Text style={styles.doneTitle}>Thank you</Text>
          <Text style={styles.doneSub}>
            Your feedback is anonymous and goes straight to the team. It genuinely shapes what we build next.
          </Text>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} />
        <View style={styles.headerText}>
          <Text style={styles.title}>HereNow Survey</Text>
          <Text style={styles.sub}>Anonymous · ~3 minutes</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introCard}>
          <Text style={styles.introText}>
            Your answers are completely anonymous — we can't tie them to you. Be as honest as you want.
          </Text>
        </View>

        {SURVEY_QUESTIONS.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i + 1}
            question={q}
            value={answers[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
          />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.submitBtn, (!requiredMet || saving) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!requiredMet || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.submitBtnText}>Submit Feedback</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

function QuestionCard({
  index, question, value, onChange,
}: {
  index: number
  question: SurveyQuestion
  value: string | number | undefined
  onChange: (v: string | number) => void
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.prompt}>
        <Text style={styles.promptNum}>{index}. </Text>{question.prompt}
      </Text>

      {question.type === 'stars' && (
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => {
            const active = typeof value === 'number' && value >= n
            return (
              <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={6}>
                <Ionicons name={active ? 'star' : 'star-outline'} size={34} color={active ? '#f59e0b' : '#3A5170'} />
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {question.type === 'scale' && (
        <View>
          <View style={styles.scaleRow}>
            {Array.from({ length: 11 }, (_, n) => {
              const active = value === n
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.scaleCell, active && styles.scaleCellActive]}
                  onPress={() => onChange(n)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.scaleCellText, active && styles.scaleCellTextActive]}>{n}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {(question.minLabel || question.maxLabel) && (
            <View style={styles.scaleLabels}>
              <Text style={styles.scaleLabelText}>{question.minLabel}</Text>
              <Text style={styles.scaleLabelText}>{question.maxLabel}</Text>
            </View>
          )}
        </View>
      )}

      {question.type === 'single' && (
        <View style={styles.optionsCol}>
          {question.options!.map((opt) => {
            const active = value === opt
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => onChange(opt)}
                activeOpacity={0.8}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {question.type === 'text' && (
        <TextInput
          style={styles.textInput}
          placeholder="Type your answer…"
          placeholderTextColor="#4A6580"
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          multiline
          textAlignVertical="top"
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  sub: { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  scroll: { flex: 1 },
  content: {
    padding: 16, gap: 12, paddingBottom: 40,
    ...Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as const, width: '100%' as any }, default: {} }),
  },
  introCard: {
    backgroundColor: '#29B6F612', borderColor: '#29B6F633', borderWidth: 1,
    borderRadius: 12, padding: 14,
  },
  introText: { fontSize: 13, color: '#9fd4f5', lineHeight: 19 },
  card: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 14,
  },
  prompt: { fontSize: 15, fontWeight: '700', color: '#f8fafc', lineHeight: 21 },
  promptNum: { color: '#29B6F6' },
  starsRow: { flexDirection: 'row', gap: 10 },
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scaleCell: {
    width: 30, height: 34, borderRadius: 8,
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
    alignItems: 'center', justifyContent: 'center',
  },
  scaleCellActive: { borderColor: '#29B6F6', backgroundColor: '#29B6F6' },
  scaleCellText: { fontSize: 13, fontWeight: '700', color: '#8EADC7' },
  scaleCellTextActive: { color: '#050A15' },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  scaleLabelText: { fontSize: 11, color: '#7A93AC' },
  optionsCol: { gap: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#07101F', borderRadius: 10,
    borderWidth: 1, borderColor: '#1A2E4A', paddingHorizontal: 12, paddingVertical: 11,
  },
  optionActive: { borderColor: '#29B6F6', backgroundColor: '#29B6F612' },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#3A5170',
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: '#29B6F6' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#29B6F6' },
  optionText: { flex: 1, fontSize: 14, color: '#cbd5e1', fontWeight: '600' },
  optionTextActive: { color: '#f8fafc' },
  textInput: {
    backgroundColor: '#07101F', borderRadius: 10, borderWidth: 1, borderColor: '#1A2E4A',
    color: '#f8fafc', fontSize: 14, padding: 12, minHeight: 76, lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#0D1B2E',
  },
  submitBtn: {
    backgroundColor: '#29B6F6', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 17, fontWeight: '800', color: '#050A15' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  doneEmoji: { fontSize: 56 },
  doneTitle: { fontSize: 26, fontWeight: '900', color: '#f8fafc' },
  doneSub: { fontSize: 14, color: '#7A93AC', textAlign: 'center', lineHeight: 20 },
  doneBtn: {
    marginTop: 16, backgroundColor: '#29B6F6', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 40,
  },
  doneBtnText: { fontSize: 16, fontWeight: '800', color: '#050A15' },
})
