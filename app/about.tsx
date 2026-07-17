import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import BackButton from '@/components/BackButton'

export default function AboutScreen() {
  const insets = useSafeAreaInsets()
  const version = Constants.expoConfig?.version ?? '1.0.0'

  const openMail = () => {
    const url = 'mailto:support@herenow.app'
    if (Platform.OS === 'web') window.location.href = url
    else Linking.openURL(url)
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/settings' as any)} />
        <Text style={styles.title}>About HereNow</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.wordmark}>HereNow</Text>
        <Text style={styles.tagline}>The people around you are more interesting than your feed.</Text>

        <Text style={styles.body}>
          HereNow is a presence layer for going out. Check in to a venue, see who is actually there right now,
          and meet people in real life. When you leave, your presence disappears. No endless feed, no followers
          to chase, just the room you are in.
        </Text>

        <View style={styles.linksCard}>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/legal/privacy' as any)}>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/legal/terms' as any)}>
            <Text style={styles.linkText}>Terms of Service</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.linkRow} onPress={openMail}>
            <Text style={styles.linkText}>Contact Support</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Version {version}</Text>
        <Text style={styles.madeIn}>Made for going out.</Text>
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
  content: { padding: 24, alignItems: 'center' },
  wordmark: { fontSize: 34, fontWeight: '900', color: '#29B6F6', marginTop: 16 },
  tagline: { fontSize: 15, color: '#f8fafc', fontWeight: '600', textAlign: 'center', marginTop: 8, lineHeight: 21 },
  body: { fontSize: 14, color: '#8EADC7', lineHeight: 22, textAlign: 'center', marginTop: 20 },
  linksCard: {
    alignSelf: 'stretch', backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A', marginTop: 28, overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  linkText: { fontSize: 15, color: '#f8fafc', fontWeight: '600' },
  chevron: { fontSize: 20, color: '#4A6580' },
  divider: { height: 1, backgroundColor: '#1A2E4A', marginLeft: 16 },
  version: { fontSize: 13, color: '#4A6580', marginTop: 28 },
  madeIn: { fontSize: 12, color: '#4A6580', marginTop: 6 },
})
