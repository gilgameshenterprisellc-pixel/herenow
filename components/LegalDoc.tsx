import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import BackButton from '@/components/BackButton'

export interface LegalSection {
  heading: string
  body: string[]
}

// Shared shell for the Privacy Policy and Terms screens: back header + a
// scrollable, readable prose column that stays contained on web.
export default function LegalDoc({
  title, updated, intro, sections,
}: {
  title: string
  updated: string
  intro?: string
  sections: LegalSection[]
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/settings' as any)} />
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 680, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated {updated}</Text>
        {intro ? <Text style={styles.intro}>{intro}</Text> : null}

        {sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            {s.body.map((p, i) => (
              <Text key={i} style={styles.paragraph}>{p}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
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
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  updated: { fontSize: 12, color: '#4A6580', marginBottom: 16 },
  intro: { fontSize: 14, color: '#8EADC7', lineHeight: 21, marginBottom: 20 },
  section: { marginBottom: 20 },
  heading: { fontSize: 16, fontWeight: '800', color: '#f8fafc', marginBottom: 8 },
  paragraph: { fontSize: 14, color: '#8EADC7', lineHeight: 21, marginBottom: 8 },
})
