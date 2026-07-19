import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { VenueHighlight } from '@/lib/highlights'

interface VenueWelcomeData {
  name: string
  description: string | null
  opening_hours: string | null
  firstPhoto: string | null
  highlights: VenueHighlight[]
}

interface Props {
  visible: boolean
  data: VenueWelcomeData | null
  onDismiss: () => void
}

export default function VenueWelcomeModal({ visible, data, onDismiss }: Props) {
  if (!data) return null

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {data.firstPhoto && (
            <Image source={{ uri: data.firstPhoto }} style={styles.heroPhoto} resizeMode="cover" />
          )}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>FIRST VISIT</Text>
            </View>

            <Text style={styles.venueLabel}>Welcome to</Text>
            <Text style={styles.venueName}>{data.name}</Text>

            {data.description ? (
              <Text style={styles.description}>{data.description}</Text>
            ) : null}

            {data.opening_hours ? (
              <View style={styles.hoursRow}>
                <Ionicons name="time" size={15} color="#29B6F6" />
                <Text style={styles.hoursText}>{data.opening_hours}</Text>
              </View>
            ) : null}

            {data.highlights.length > 0 && (
              <View style={styles.highlightsSection}>
                <Text style={styles.highlightsLabel}>What to know</Text>
                {data.highlights.slice(0, 3).map((h) => (
                  <View key={h.id} style={styles.highlightRow}>
                    <Text style={styles.highlightEmoji}>{h.emoji ?? ''}</Text>
                    <View style={styles.highlightText}>
                      <Text style={styles.highlightTitle}>{h.title}</Text>
                      {h.body ? <Text style={styles.highlightBody} numberOfLines={2}>{h.body}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.btn} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={styles.btnText}>Let's Go →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 21, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#29B6F640',
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  heroPhoto: {
    width: '100%',
    height: 160,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 20, gap: 14 },
  badge: {
    backgroundColor: '#29B6F618',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#29B6F630',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#29B6F6', letterSpacing: 1.2 },
  venueLabel: { fontSize: 13, color: '#7A93AC', marginTop: 2 },
  venueName: { fontSize: 24, fontWeight: '900', color: '#f8fafc', lineHeight: 28 },
  description: { fontSize: 14, color: '#8EADC7', lineHeight: 20 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoursIcon: { fontSize: 16 },
  hoursText: { fontSize: 13, color: '#7A93AC' },
  highlightsSection: { gap: 10 },
  highlightsLabel: { fontSize: 11, fontWeight: '700', color: '#7A93AC', textTransform: 'uppercase', letterSpacing: 0.5 },
  highlightRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  highlightEmoji: { fontSize: 18, marginTop: 1 },
  highlightText: { flex: 1, gap: 2 },
  highlightTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  highlightBody:  { fontSize: 12, color: '#7A93AC', lineHeight: 16 },
  btn: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#29B6F6',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '800', color: '#050A15' },
})
