import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'

const ONBOARDING_KEY = 'herenow_onboarding_v1_seen'
const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const SLIDES = [
  {
    emoji: '📍',
    title: 'Welcome to HereNow',
    subtitle: 'Where you are is who you meet.',
    body: 'HereNow is a location-aware social layer for the real world. Walk into a bar, a coffee shop, or an event — check in, and see who else is there right now.\n\nNo swiping. No algorithm. Just real people, in real places, right now.',
    accent: '#29B6F6',
  },
  {
    emoji: '🎭',
    title: 'Social Mode',
    subtitle: 'Tell people why you\'re out.',
    body: 'Before you check in, you pick your intent — so nobody has to guess.\n\n💘  Dating — open to romantic connection\n🤝  Friends — here to socialize\n💼  Networking — creative or professional\n✌️  Just Vibes — here for the energy\n\nEveryone at the venue sees your mode. It removes the ambiguity.',
    accent: '#a855f7',
  },
  {
    emoji: '🟢',
    title: 'Mood Mode',
    subtitle: 'How approachable are you right now?',
    body: 'Separate from your Social Mode — this is about how you\'re feeling in the moment.\n\n🟢  Open — come say hi\n🟡  Selective — thoughtful over quantity\n🛡️  Not Today — hard boundary, no approaches\n\nNot Today is respected by the app. No one can send you a We Met request if you\'re set to Not Today.',
    accent: '#22c55e',
  },
  {
    emoji: '🤝',
    title: 'We Met',
    subtitle: 'The IRL handshake.',
    body: 'When you actually meet someone in person — both of you confirm it with a "We Met" tap.\n\nNo We Met = no DMs. It keeps things real and intentional.\n\nThe moment you both confirm, DMs open. Someone has 48 hours to make the first move — and one reply keeps the chat open for good.\n\nSo actually go talk to people first.',
    accent: '#f43f5e',
  },
  {
    emoji: '✨',
    title: 'Afterglow',
    subtitle: 'The recap after a real night out.',
    body: 'When you check out of a venue, you get a recap — how long you were there, how many people were around, how many connections you made.\n\nIt\'s the reflection moment. The thing you\'ll screenshot and send your friends.\n\nNow go check in somewhere.',
    accent: '#f59e0b',
  },
]

interface Props {
  onDone: () => void
}

export default function OnboardingModal({ onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const fadeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      if (!val) setVisible(true)
    })
  }, [])

  const animateStep = (next: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setStep(next)
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start()
    })
  }

  const handleNext = () => {
    if (step < SLIDES.length - 1) {
      animateStep(step + 1)
    } else {
      handleDone()
    }
  }

  const handleBack = () => {
    if (step > 0) animateStep(step - 1)
  }

  const handleDone = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1')
    setVisible(false)
    onDone()
  }

  const slide = SLIDES[step]
  const isLast = step === SLIDES.length - 1

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Progress dots */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && { backgroundColor: slide.accent, width: 20 },
                  i < step && { backgroundColor: slide.accent + '60' },
                ]}
              />
            ))}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Animated.View style={[styles.slideContent, { opacity: fadeAnim }]}>
              <Text style={styles.emoji}>{slide.emoji}</Text>
              <Text style={[styles.title, { color: slide.accent }]}>{slide.title}</Text>
              <Text style={styles.subtitle}>{slide.subtitle}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </Animated.View>
          </ScrollView>

          {/* Navigation */}
          <View style={styles.nav}>
            {step > 0 ? (
              <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.skipBtn} onPress={handleDone}>
                <Text style={styles.skipBtnText}>Skip</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: slide.accent }]}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>
                {isLast ? "Let's Go 🚀" : 'Next →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,10,21,0.92)',
    justifyContent: 'flex-end',
    // On desktop web the bottom sheet stretched edge-to-edge and read cheap.
    // Center it as a contained card instead. Native keeps the bottom-sheet feel.
    ...Platform.select({
      web: { justifyContent: 'center', alignItems: 'center', padding: 24 } as any,
      default: {},
    }),
  },
  sheet: {
    backgroundColor: '#0A1628',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_HEIGHT * 0.82,
    borderTopWidth: 1,
    borderColor: '#1A2E4A',
    ...Platform.select({
      web: {
        maxWidth: 440,
        width: '100%' as any,
        alignSelf: 'center' as const,
        borderRadius: 28,
        borderWidth: 1,
        maxHeight: 660,
        boxShadow: '0 0 0 1px rgba(41,182,246,0.15), 0 24px 80px rgba(0,0,0,0.6)',
      } as any,
      default: {},
    }),
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 20,
    paddingBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A2E4A',
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 20,
  },
  slideContent: {
    gap: 12,
  },
  emoji: {
    fontSize: 52,
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#8EADC7',
    textAlign: 'center',
    fontWeight: '500',
  },
  body: {
    fontSize: 15,
    color: '#D0E8F5',
    lineHeight: 24,
    marginTop: 8,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A2E4A',
  },
  skipBtn: { padding: 10 },
  skipBtnText: { color: '#4A6580', fontSize: 14, fontWeight: '600' },
  backBtn: { padding: 10 },
  backBtnText: { color: '#7A93AC', fontSize: 14, fontWeight: '600' },
  nextBtn: {
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 130,
    alignItems: 'center',
  },
  nextBtnText: { color: '#050A15', fontSize: 15, fontWeight: '800' },
})
