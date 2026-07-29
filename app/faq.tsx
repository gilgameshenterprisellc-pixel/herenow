import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import BackButton from '@/components/BackButton'

type QA = { q: string; a: string }
// `role` marks the three audience dividers (For People / For Venues / For
// Organizations). They render bigger and in white so the FAQ reads as three
// clear audiences with their sub-topics grouped underneath (Jacob, Jul 2026).
type FaqSection = { section: string; items: QA[]; role?: boolean }

const FAQ: FaqSection[] = [
  {
    section: 'For People',
    role: true,
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
    role: true,
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
  {
    section: 'For Organizations',
    role: true,
    items: [
      { q: 'What is an Organization account?', a: 'An Organization account is designed for brands, businesses, teams, artists, charities, creators, and other public entities that want to build a presence on HereNow. Unlike personal accounts, Organization accounts exist to communicate with people, grow communities, and participate in venues and events.' },
      { q: 'Who should register as an Organization?', a: 'Organizations can include brands, businesses, sports teams, universities, nonprofits, event organizers, artists and bands, media companies, podcasts, public figures, creator teams, and any legitimate public entity representing something larger than an individual.' },
      { q: 'How is an Organization different from a personal account?', a: 'Organization accounts have tools built specifically for community engagement rather than meeting people. Organizations can build followers, publish updates, participate in authorized venues, communicate with their audience, and analyze engagement. They are not intended for dating or personal networking.' },
      { q: 'Can Organizations see who is at a venue?', a: 'No. Organizations never receive personal information about guests unless someone voluntarily interacts with them. If an Organization is authorized by a venue, it can communicate with people currently checked in, but individual user privacy is always protected.' },
      { q: 'Can Organizations message users?', a: 'Yes, but only within the permissions provided by HereNow. Users can choose to follow an Organization and interact with its content. Organizations cannot spam or send unsolicited messages outside the rules of the platform.' },
      { q: 'Can Organizations use "We Met"?', a: 'No. "We Met" is reserved for personal interactions between people. Organizations cannot collect We Met connections.' },
      { q: 'Can Organizations broadcast inside venues?', a: 'Yes, if the venue gives them permission. Venues can authorize specific Organizations to post updates, announcements, promotions, or other content to guests who are currently checked in. For example, a brewery partnering with a food truck, a concert venue hosting an artist, a festival working with sponsors, or a university promoting campus events. This lets venues collaborate with trusted partners while keeping control over who can communicate with guests.' },
      { q: 'Can any Organization broadcast anywhere?', a: 'No. Organizations can only broadcast inside venues that have explicitly authorized them. Venue owners remain in complete control over who is allowed to communicate with their guests.' },
      { q: 'How do I know an Organization is authentic?', a: "Verified Organizations receive an Official badge after completing HereNow's verification process. This helps users distinguish legitimate brands and organizations from impersonators." },
      { q: 'Can Organizations have followers?', a: 'Yes. Users can follow Organizations to stay updated on announcements, events, promotions, and future activity.' },
      { q: 'Can Organizations create events?', a: 'Yes. Organizations can create and promote events that users can discover through HereNow. Depending on the event, users may be able to RSVP, receive updates, or check in once they arrive.' },
      { q: 'Can Organizations own venues?', a: 'Yes. If an Organization operates a physical location or hosts recurring events, it can also manage one or more Venue accounts. Organizations and Venues are separate account types with different permissions, allowing businesses that operate multiple locations or events to manage everything under one brand.' },
      { q: 'Can creators register as Organizations?', a: 'Individual creators generally apply for a Creator account instead. Creator accounts are intended for individuals with an established audience, while Organization accounts represent brands, companies, teams, or other entities rather than a single person.' },
      { q: 'Why separate Organizations from personal accounts?', a: 'Keeping Organizations separate creates a better experience for everyone. People use personal accounts to connect with other people. Organizations use dedicated tools to communicate with audiences, promote events, and build communities without affecting the personal social experience that makes HereNow unique.' },
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
          <View key={sec.section} style={[styles.section, sec.role && styles.roleSection]}>
            <Text style={sec.role ? styles.roleSectionTitle : styles.sectionTitle}>{sec.section}</Text>
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

        <Text style={styles.footer}>Still have a question? Reach us at support@herenowsocial.com</Text>
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
  // Extra top space so each audience divider reads as the start of a new group.
  roleSection: { marginTop: 30 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#4A6580',
    textTransform: 'uppercase', letterSpacing: 0.8, paddingLeft: 4, marginBottom: 8,
  },
  roleSectionTitle: {
    fontSize: 20, fontWeight: '800', color: '#f8fafc',
    paddingLeft: 4, marginBottom: 10,
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
