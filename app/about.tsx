import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import BackButton from '@/components/BackButton'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

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
          Platform.select({ web: { maxWidth: 620, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.wordmark}>HereNow</Text>
        <Text style={styles.tagline}>The social layer for the real world.</Text>

        <Para>
          The world has never been more connected online, yet many of our real-world experiences have become
          less social. We spend more time looking at our phones than engaging with the people around us, and we
          share moments after they have happened instead of participating in them while they are unfolding.
        </Para>
        <Para>
          HereNow was built to help change that. It is designed to make being out in the real world more
          connected, more spontaneous, and more meaningful. Whether you are grabbing coffee, attending a concert,
          watching the game, or meeting friends for dinner, HereNow adds a shared social experience to the places
          you are already going.
        </Para>

        <Section title="Built around places">
          <Para>
            Most social platforms are organized around people. You follow accounts, build audiences, and scroll
            through feeds curated by algorithms. HereNow takes a different approach — it is organized around
            places. Every participating venue becomes its own living community that changes throughout the day as
            people arrive, interact, and move on. The experience is not built around who has the most followers.
            It is built around where life is happening.
          </Para>
        </Section>

        <Section title="How it works">
          <Para>
            Using HereNow is simple. Discover a participating venue, check in when you arrive, and become part of
            that venue&apos;s live community. Share the experience while you are there. When you leave, the experience
            stays with the venue, and you move on to the next one. No complicated setup. No endless feed. Just
            real places with real people.
          </Para>
        </Section>

        <Section title="Become part of the room">
          <Para>Checking into a venue unlocks its live community. While you are there, you can:</Para>
          <Bullet>Discover who else has chosen to be visible.</Bullet>
          <Bullet>Contribute to The Pulse, a live collection of moments from inside the venue.</Bullet>
          <Bullet>Join the venue&apos;s Chat and take part in conversations happening in real time.</Bullet>
          <Bullet>Browse or contribute to The Board, the venue&apos;s community bulletin board.</Bullet>
          <Bullet>Meet new people naturally through shared experiences.</Bullet>
          <Bullet>Build your personal history of places, events, and memories.</Bullet>
          <Para>Every venue has its own personality because every community is different.</Para>
        </Section>

        <Section title="Designed for the present">
          <Para>
            HereNow is not meant to create another permanent social feed. Many parts of the experience are
            intentionally temporary. Communities change, conversations evolve, and people come and go. That sense
            of presence is what makes HereNow feel alive.
          </Para>
        </Section>

        <Section title="Some moments deserve to last">
          <Para>
            While much of the experience is designed to be ephemeral, the memories do not have to disappear. After
            your experience, HereNow creates Afterglow — a private recap of your time out. It is your personal
            reflection of where you went, what you experienced, and the moments that made the day memorable. Not
            everything needs to live forever. The moments that matter should.
          </Para>
        </Section>

        <Section title="Built with privacy in mind">
          <Para>
            You decide when you participate. You decide when you are visible. You decide when you leave. There are
            no unsolicited direct messages from strangers, and many interactions begin only after people have
            actually met in person. Privacy and user control are not optional features — they are part of the
            foundation of HereNow.
          </Para>
        </Section>

        <Section title="A growing network">
          <Para>
            HereNow is also designed to help local businesses build stronger communities. Every new person
            strengthens the community, every new venue creates more opportunities to explore, and every new city
            expands the network. HereNow grows one community at a time, because strong local communities create
            lasting networks. The goal is not simply to build another social platform. It is to strengthen the
            social fabric of the places we already share.
          </Para>
        </Section>

        <Text style={styles.welcome}>The real world has always been social. Now it has a place to connect.</Text>

        <View style={styles.linksCard}>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/faq' as any)}>
            <Text style={styles.linkText}>FAQ</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
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
  content: { padding: 24 },
  wordmark: { fontSize: 34, fontWeight: '900', color: '#29B6F6', marginTop: 8, textAlign: 'center' },
  tagline: { fontSize: 15, color: '#f8fafc', fontWeight: '600', textAlign: 'center', marginTop: 8, lineHeight: 21 },
  section: { marginTop: 26 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc', marginBottom: 8 },
  body: { fontSize: 14, color: '#8EADC7', lineHeight: 22, marginTop: 12 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#29B6F6', marginTop: 8 },
  bulletText: { flex: 1, fontSize: 14, color: '#8EADC7', lineHeight: 22 },
  welcome: {
    fontSize: 15, color: '#29B6F6', fontWeight: '700', textAlign: 'center',
    lineHeight: 22, marginTop: 30,
  },
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
  version: { fontSize: 13, color: '#4A6580', marginTop: 28, textAlign: 'center' },
  madeIn: { fontSize: 12, color: '#4A6580', marginTop: 6, textAlign: 'center' },
})
