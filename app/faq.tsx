import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import BackButton from '@/components/BackButton'

type QA = { q: string; a: string }
type FaqSection = { section: string; items: QA[] }

const FAQ: FaqSection[] = [
  {
    section: 'For People',
    items: [
      { q: 'What is HereNow?', a: "HereNow is a place-based social platform that helps people discover what's happening around them in real time. By checking into participating venues, you become part of that venue's live community and can experience what's happening while you're there." },
      { q: 'Is HereNow free?', a: 'Yes. HereNow is free to download and use.' },
      { q: 'Is HereNow available everywhere?', a: 'HereNow is expanding city by city. As more venues and communities join the network, the experience continues to grow.' },
    ],
  },
  {
    section: 'Getting Started',
    items: [
      { q: 'How do I use HereNow?', a: "Create an account, discover a participating venue, check in when you arrive, and become part of that venue's live community." },
      { q: 'Do I have to be at the venue?', a: 'Yes. Check-ins are location verified to help ensure every community remains authentic.' },
      { q: 'Can I check into more than one venue?', a: 'No. You can only be checked into one venue at a time.' },
      { q: 'What happens when I leave?', a: "You'll automatically be checked out when you leave the venue, or you can check out manually at any time." },
    ],
  },
  {
    section: 'Features',
    items: [
      { q: 'What is The Pulse?', a: 'The Pulse is a live collection of moments shared from inside a venue, giving everyone there a snapshot of what is happening in real time.' },
      { q: 'What is Chat?', a: 'Chat is a live conversation shared by everyone currently checked into the same venue.' },
      { q: 'What is The Board?', a: 'The Board is each venue’s community bulletin board where people can share announcements, opportunities, recommendations, discussions, and more.' },
      { q: 'What is Afterglow?', a: 'Afterglow is your private recap of an experience, helping you remember the places you visited, the moments you shared, and the people you met.' },
      { q: 'What is My Circle?', a: 'My Circle is your private network of friends within HereNow, making it easy to stay connected with the people you know.' },
      { q: 'What is We Met?', a: "We Met lets two people mutually confirm they met in person. Once both people confirm, the connection is saved to their We Met history, and if they weren't already connected, private messaging becomes available." },
      { q: 'What are badges?', a: "Badges celebrate the places you've explored, milestones you've reached, and experiences you've had throughout the HereNow community." },
    ],
  },
  {
    section: 'Privacy & Safety',
    items: [
      { q: 'Can people see where I am?', a: "Only while you've voluntarily checked into a participating venue." },
      { q: 'Can I hide myself?', a: 'Yes. You control your visibility and can choose not to appear to other users.' },
      { q: 'Can strangers message me?', a: 'No. HereNow encourages genuine, real-world interactions before private conversations. Private messaging only becomes available after two people mutually confirm they met in person.' },
      { q: 'Is my location tracked all the time?', a: 'No. Location is used to verify check-ins and support the HereNow experience. You remain in control of your visibility.' },
      { q: 'Can I block or report someone?', a: 'Yes. Users can block and report inappropriate behavior directly within the app.' },
    ],
  },
  {
    section: 'Community',
    items: [
      { q: 'Do I need friends already using HereNow?', a: 'No. HereNow is designed to help you discover communities wherever you go.' },
      { q: "Can I use HereNow if I'm by myself?", a: 'Absolutely. Many people use HereNow to discover what is happening, meet new people, or simply feel more connected while exploring.' },
      { q: 'Is HereNow only for nightlife?', a: 'No. HereNow can be used anywhere people gather, including restaurants, coffee shops, campuses, concerts, sporting events, festivals, parks, libraries, hotels, and more.' },
      { q: 'Why do I only see participating venues?', a: 'HereNow focuses on venues that have chosen to participate, helping ensure every place you discover offers an active and meaningful community experience.' },
      { q: 'Why does HereNow use check-ins?', a: "Check-ins create authentic, real-time communities. By knowing who's actually present, HereNow can offer experiences that reflect what's happening now, not what happened yesterday." },
    ],
  },
  {
    section: 'Account',
    items: [
      { q: 'How do I delete my account?', a: 'You can permanently delete your account from the Settings menu within the app.' },
      { q: 'I found a bug. How do I report it?', a: 'You can submit bug reports and feedback directly through the app or by contacting the HereNow support team.' },
      { q: 'I have an idea or suggestion.', a: "We'd love to hear it. Community feedback plays an important role in shaping the future of HereNow." },
    ],
  },
  {
    section: 'For Venues',
    items: [
      { q: 'What is a venue?', a: 'A venue is any place where people come together. Many venues are permanent businesses such as restaurants, bars, coffee shops, breweries, hotels, stadiums, and entertainment venues, but they can also be temporary locations created for a specific event such as a block party, music festival, farmers market, tailgate, conference, or pop-up experience.' },
      { q: 'Can a venue be temporary?', a: 'Yes. Temporary venues can be created for events like festivals, tailgates, conferences, block parties, or pop-up markets. These communities exist only for the duration of the event and automatically conclude when it ends.' },
      { q: 'Why should my business join HereNow?', a: 'HereNow helps businesses build stronger communities by giving guests a shared social experience while providing venues with valuable insights, communication tools, and new ways to engage their customers.' },
      { q: 'What types of businesses can join?', a: 'Any place where people naturally gather, including restaurants, bars, breweries, coffee shops, hotels, entertainment venues, sports venues, campuses, festivals, and more.' },
      { q: 'What information does my business receive?', a: 'Businesses receive aggregated insights about activity at their venue, such as customer trends, peak hours, engagement, and community growth. Personal information about individual users is not shared.' },
      { q: 'Can I communicate with my customers?', a: 'Yes. Participating venues can share announcements, events, promotions, and other updates with their community through HereNow.' },
      { q: 'Do I need special equipment?', a: 'No. There is no hardware to install. Your venue profile and tools are managed through the HereNow Venue Portal.' },
      { q: 'What if someone posts inappropriate content?', a: 'Venue managers have moderation tools for community features, and users can report inappropriate content or behavior. Chat and The Pulse also use auto-moderation and photo screening to weed out profanity, slurs, hate speech, and explicit content.' },
      { q: 'Can I see exactly who visits my venue?', a: 'No. HereNow is designed to protect user privacy. Businesses receive aggregated insights that help them understand their community without exposing personal information about individual users.' },
      { q: 'How much does it cost?', a: "HereNow offers different participation options depending on your business's needs. Visit our Venue page or contact us to learn more." },
    ],
  },
]

function FaqItem({ item }: { item: QA }) {
  const [open, setOpen] = useState(false)
  return (
    <View>
      <TouchableOpacity style={styles.qRow} onPress={() => setOpen((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.qText}>{item.q}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#4A6580" />
      </TouchableOpacity>
      {open && <Text style={styles.aText}>{item.a}</Text>}
    </View>
  )
}

export default function FaqScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/' as any)} />
        <Text style={styles.title}>FAQ</Text>
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
        <Text style={styles.intro}>Frequently asked questions about HereNow. Tap a question to expand it.</Text>

        {FAQ.map((sec) => (
          <View key={sec.section} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.section}</Text>
            <View style={styles.sectionCard}>
              {sec.items.map((item, i) => (
                <View key={item.q}>
                  {i > 0 && <View style={styles.divider} />}
                  <FaqItem item={item} />
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>Still have a question? Reach us at support@herenow.app</Text>
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
  content: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 14, color: '#8EADC7', lineHeight: 21, marginTop: 6, marginBottom: 8 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#4A6580',
    textTransform: 'uppercase', letterSpacing: 0.8, paddingLeft: 4, marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A', overflow: 'hidden',
  },
  qRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, paddingHorizontal: 16, paddingVertical: 15,
  },
  qText: { flex: 1, fontSize: 15, color: '#f8fafc', fontWeight: '600', lineHeight: 20 },
  aText: {
    fontSize: 14, color: '#8EADC7', lineHeight: 22,
    paddingHorizontal: 16, paddingBottom: 16, paddingTop: 0,
  },
  divider: { height: 1, backgroundColor: '#1A2E4A' },
  footer: { fontSize: 13, color: '#4A6580', textAlign: 'center', marginTop: 28 },
})
