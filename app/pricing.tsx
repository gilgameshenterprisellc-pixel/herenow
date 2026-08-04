import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import BackButton from '@/components/BackButton'
import {
  plansFor, formatPrice, formatAnnual, FOUNDING_VENUE_PROGRAM,
  type Audience, type Plan,
} from '@/lib/pricing'

const SALES_EMAIL = 'support@herenowsocial.com'

const TABS: { key: Audience; label: string }[] = [
  { key: 'venue',        label: 'Venues' },
  { key: 'organization', label: 'Organizations' },
  { key: 'consumer',     label: 'HereNow Plus' },
]

function openMail(subject: string) {
  const url = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`
  if (Platform.OS === 'web') window.location.href = url
  else Linking.openURL(url).catch(() => {})
}

// CTA for a plan. Stripe isn't live yet, so paid B2B plans route to a real
// human (Jacob onboards venues/orgs manually during the pilot — this is also
// exactly the Founding Venue path) and consumer Plus shows a launch note.
// When Stripe goes live and a plan's stripe.monthlyPriceId is set, wire the
// checkout at the marked spot below and it lights up with no UI change.
function cta(plan: Plan): { label: string; onPress: (() => void) | null; disabled?: boolean } {
  // TODO(stripe): when plan.stripe?.monthlyPriceId is set, start Stripe checkout
  // here instead of the contact/launch fallbacks below.
  if (plan.price.kind === 'free') {
    return { label: 'Included', onPress: null, disabled: true }
  }
  if (plan.price.kind === 'custom') {
    return { label: 'Contact sales', onPress: () => openMail(`HereNow Enterprise — ${plan.name}`) }
  }
  if (plan.audience === 'consumer') {
    return { label: 'Available at launch', onPress: null, disabled: true }
  }
  // Paid venue / organization plan — contact to get set up now.
  return { label: 'Get started', onPress: () => openMail(`HereNow ${plan.name} plan`) }
}

function PlanCard({ plan }: { plan: Plan }) {
  const c = cta(plan)
  const annual = formatAnnual(plan.price)
  return (
    <View style={[styles.card, plan.highlight && styles.cardHighlight]}>
      {plan.highlight && (
        <View style={styles.badge}><Text style={styles.badgeText}>Recommended</Text></View>
      )}
      <Text style={styles.planName}>{plan.name}</Text>
      {plan.tagline ? <Text style={styles.planTagline}>{plan.tagline}</Text> : null}

      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatPrice(plan.price)}</Text>
      </View>
      {annual ? <Text style={styles.annual}>{annual}</Text> : null}

      {plan.designedFor ? (
        <View style={styles.designedFor}>
          <Text style={styles.groupHeading}>Designed for</Text>
          <Text style={styles.designedForText}>{plan.designedFor.join(' · ')}</Text>
        </View>
      ) : null}

      {plan.featureGroups.map((g) => (
        <View key={g.heading} style={styles.group}>
          <Text style={styles.groupHeading}>{g.heading}</Text>
          {g.items.map((item) => (
            <View key={item} style={styles.featureRow}>
              <Ionicons name="checkmark" size={15} color="#29B6F6" style={styles.check} />
              <Text style={styles.featureText}>{item}</Text>
            </View>
          ))}
        </View>
      ))}

      <TouchableOpacity
        style={[styles.ctaBtn, plan.highlight && styles.ctaBtnPrimary, c.disabled && styles.ctaBtnDisabled]}
        onPress={c.onPress ?? undefined}
        disabled={!c.onPress}
        activeOpacity={0.85}
      >
        <Text style={[styles.ctaText, plan.highlight && styles.ctaTextPrimary, c.disabled && styles.ctaTextDisabled]}>
          {c.label}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function FoundingCard() {
  return (
    <View style={styles.founding}>
      <View style={styles.foundingHead}>
        <Ionicons name="star" size={16} color="#f59e0b" />
        <Text style={styles.foundingTitle}>{FOUNDING_VENUE_PROGRAM.name}</Text>
      </View>
      <Text style={styles.foundingNote}>{FOUNDING_VENUE_PROGRAM.note}</Text>
      {FOUNDING_VENUE_PROGRAM.includes.map((item) => (
        <View key={item} style={styles.featureRow}>
          <Ionicons name="checkmark" size={15} color="#f59e0b" style={styles.check} />
          <Text style={styles.featureText}>{item}</Text>
        </View>
      ))}
      <TouchableOpacity
        style={[styles.ctaBtn, styles.foundingBtn]}
        onPress={() => openMail('HereNow Founding Venue Program')}
        activeOpacity={0.85}
      >
        <Text style={[styles.ctaText, styles.foundingBtnText]}>Become a Founding Venue</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function PricingScreen() {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<Audience>('venue')
  const plans = plansFor(tab)

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <Text style={styles.headerTitle}>Plans & Pricing</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
        {tab === 'venue' && <FoundingCard />}
        <Text style={styles.footnote}>
          Prices in USD. Paid plans are onboarded directly during the pilot — reach us at {SALES_EMAIL}.
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  tabs: {
    flexDirection: 'row', gap: 8, padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  tab: {
    flex: 1, paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  tabText: { color: '#8EADC7', fontWeight: '700', fontSize: 12 },
  tabTextActive: { color: '#29B6F6' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },

  card: {
    backgroundColor: '#0D1B2E', borderRadius: 18, borderWidth: 1, borderColor: '#1A2E4A',
    padding: 18, gap: 6,
  },
  cardHighlight: { borderColor: '#29B6F6', backgroundColor: '#0E2035' },
  badge: {
    alignSelf: 'flex-start', backgroundColor: '#29B6F6', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4,
  },
  badgeText: { color: '#050A15', fontWeight: '800', fontSize: 10, letterSpacing: 0.4 },
  planName: { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
  planTagline: { fontSize: 13, color: '#7A93AC' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 6 },
  price: { fontSize: 30, fontWeight: '900', color: '#f8fafc' },
  annual: { fontSize: 12, color: '#7A93AC', marginTop: -2 },

  designedFor: { marginTop: 10, gap: 4 },
  designedForText: { fontSize: 13, color: '#c9d6e3', lineHeight: 19 },

  group: { marginTop: 12, gap: 6 },
  groupHeading: {
    fontSize: 11, fontWeight: '800', color: '#29B6F6',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  check: { marginTop: 1 },
  featureText: { flex: 1, fontSize: 14, color: '#e8f4fd', lineHeight: 20 },

  ctaBtn: {
    marginTop: 16, borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#29B6F6', backgroundColor: 'transparent',
  },
  ctaBtnPrimary: { backgroundColor: '#29B6F6', borderColor: '#29B6F6' },
  ctaBtnDisabled: { borderColor: '#1A2E4A', backgroundColor: '#0A1526' },
  ctaText: { fontSize: 14, fontWeight: '800', color: '#29B6F6' },
  ctaTextPrimary: { color: '#050A15' },
  ctaTextDisabled: { color: '#4A6580' },

  founding: {
    backgroundColor: '#1A130A', borderRadius: 18, borderWidth: 1, borderColor: '#f59e0b55',
    padding: 18, gap: 6,
  },
  foundingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  foundingTitle: { fontSize: 17, fontWeight: '900', color: '#f59e0b' },
  foundingNote: { fontSize: 13, color: '#d8b483', marginBottom: 6 },
  foundingBtn: { marginTop: 16, borderColor: '#f59e0b', backgroundColor: '#f59e0b' },
  foundingBtnText: { color: '#1A130A' },

  footnote: { fontSize: 12, color: '#4A6580', textAlign: 'center', lineHeight: 18, marginTop: 4 },
})
