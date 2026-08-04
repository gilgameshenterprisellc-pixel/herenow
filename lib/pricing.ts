// HereNow pricing — single source of truth for every plan.
//
// Captured from Jacob's pricing sheet (HN Pricing.pdf, Aug 2026). The numbers
// are locked; feature lists may keep evolving. Both the /pricing screen and the
// eventual Stripe checkout read from THIS file so they can never drift apart.
//
// STRIPE: intentionally not wired yet — the HereNow Stripe account is being set
// up. Each paid plan carries a `stripe` block with null price IDs. When Stripe
// is live, paste the real IDs here (never guess them) and the checkout can go
// live without touching any UI. Free / custom (contact-sales) plans have no
// Stripe block.

export type Audience = 'venue' | 'organization' | 'consumer'

export type PriceModel =
  | { kind: 'free' }
  | { kind: 'fixed'; monthlyUsd: number; annualUsd?: number }
  | { kind: 'custom' } // contact sales

export interface FeatureGroup {
  heading: string
  items: string[]
}

export interface StripeRefs {
  productId: string | null
  monthlyPriceId: string | null
  annualPriceId: string | null
}

export interface Plan {
  id: string
  audience: Audience
  name: string
  // Short line under the name, e.g. "Everything in Free, plus:".
  tagline?: string
  price: PriceModel
  // Marks the recommended tier for emphasis in the UI.
  highlight?: boolean
  featureGroups: FeatureGroup[]
  // Only for `custom` (Enterprise) tiers.
  designedFor?: string[]
  // Present on paid tiers only. Fill when Stripe is live — do not guess IDs.
  stripe?: StripeRefs
}

const EMPTY_STRIPE: StripeRefs = { productId: null, monthlyPriceId: null, annualPriceId: null }

// ── VENUES ────────────────────────────────────────────────────────────────────
export const VENUE_PLANS: Plan[] = [
  {
    id: 'venue_free',
    audience: 'venue',
    name: 'Free',
    price: { kind: 'free' },
    featureGroups: [
      {
        heading: 'Venue Profile',
        items: ['Venue profile', 'Photos', 'Hours of operation', 'Description', 'Address & map', 'Events calendar'],
      },
      {
        heading: 'Community Features',
        items: ['Venue Chat', 'The Pulse', 'Post venue updates', 'Welcome message', 'Subscriber count'],
      },
      {
        heading: 'Basic Analytics',
        items: ['Daily check-ins', 'Peak hours', 'Basic traffic trends'],
      },
    ],
  },
  {
    id: 'venue_professional',
    audience: 'venue',
    name: 'Professional',
    tagline: 'Everything in Free, plus:',
    price: { kind: 'fixed', monthlyUsd: 99 },
    highlight: true,
    stripe: { ...EMPTY_STRIPE },
    featureGroups: [
      {
        heading: 'Advanced Analytics',
        items: [
          'New vs. returning guests', 'Age demographics', 'Gender demographics', 'Day-of-week trends',
          'Hourly heat maps', 'Event performance', 'Subscriber growth', 'Customer retention',
        ],
      },
      {
        heading: 'Marketing Tools',
        items: ['Schedule announcements', 'Broadcast messages to subscribers', 'Promotions', 'Campaign performance analytics'],
      },
      {
        heading: 'Management',
        items: ['Multiple managers/admins', 'Downloadable reports', 'Priority support'],
      },
    ],
  },
  {
    id: 'venue_growth',
    audience: 'venue',
    name: 'Growth',
    tagline: 'Everything in Professional, plus:',
    price: { kind: 'fixed', monthlyUsd: 249 },
    stripe: { ...EMPTY_STRIPE },
    featureGroups: [
      {
        heading: 'Business Intelligence',
        items: [
          'Customer cohorts', 'Visit frequency analysis', 'Customer lifetime value (future)', 'Custom date ranges',
          'Audience segmentation', 'AI-generated recommendations', 'Benchmark comparisons',
        ],
      },
      {
        heading: 'Integrations',
        items: ['API access', 'POS integrations (future)', 'CRM integrations', 'Advanced staff permissions', 'Multi-location dashboard'],
      },
    ],
  },
  {
    id: 'venue_enterprise',
    audience: 'venue',
    name: 'Enterprise',
    tagline: 'Custom pricing',
    price: { kind: 'custom' },
    designedFor: ['Restaurant groups', 'Stadiums', 'Universities', 'Casinos', 'Music venues', 'Festivals', 'Enterprise organizations'],
    featureGroups: [
      {
        heading: 'Includes',
        items: ['Unlimited locations', 'Dedicated account manager', 'Custom integrations', 'White-label reporting', 'Custom analytics', 'Service Level Agreement (SLA)'],
      },
    ],
  },
]

// ── ORGANIZATIONS ───────────────────────────────────────────────────────────
export const ORGANIZATION_PLANS: Plan[] = [
  {
    id: 'org_free',
    audience: 'organization',
    name: 'Free',
    price: { kind: 'free' },
    featureGroups: [
      {
        heading: 'Included',
        items: ['Organization profile', 'Logo & branding', 'Description', 'Events', 'Followers', 'Basic posts', 'Basic messaging'],
      },
    ],
  },
  {
    id: 'org_plus',
    audience: 'organization',
    name: 'Plus',
    tagline: 'Everything in Free, plus:',
    price: { kind: 'fixed', monthlyUsd: 29 },
    highlight: true,
    stripe: { ...EMPTY_STRIPE },
    featureGroups: [
      {
        heading: 'Included',
        items: ['Unlimited event creation', 'Broadcast announcements', 'RSVP analytics', 'Multiple administrators', 'Priority discovery', 'Organization insights'],
      },
    ],
  },
  {
    id: 'org_pro',
    audience: 'organization',
    name: 'Pro',
    tagline: 'Everything in Plus, plus:',
    price: { kind: 'fixed', monthlyUsd: 99 },
    stripe: { ...EMPTY_STRIPE },
    featureGroups: [
      {
        heading: 'Included',
        items: ['Venue broadcasting permissions', 'Advanced audience analytics', 'Lead generation tools', 'CRM export', 'API access', 'Verified Organization badge', 'Premium support'],
      },
    ],
  },
  {
    id: 'org_enterprise',
    audience: 'organization',
    name: 'Enterprise',
    tagline: 'Custom pricing',
    price: { kind: 'custom' },
    designedFor: ['Universities', 'Professional sports teams', 'Music festivals', 'National brands', 'Multi-city organizations'],
    featureGroups: [
      {
        heading: 'Includes',
        items: ['Dedicated support', 'Custom integrations', 'Advanced reporting', 'Multi-team management'],
      },
    ],
  },
]

// ── HERENOW PLUS (consumer) ─────────────────────────────────────────────────
export const CONSUMER_PLANS: Plan[] = [
  {
    id: 'plus',
    audience: 'consumer',
    name: 'HereNow Plus',
    price: { kind: 'fixed', monthlyUsd: 7.99, annualUsd: 69 },
    highlight: true,
    stripe: { ...EMPTY_STRIPE },
    featureGroups: [
      {
        heading: 'Profile',
        items: ['Public profile customization', 'Premium profile themes', 'Featured interests', 'Premium badges'],
      },
      {
        heading: 'My Circle',
        items: ['Increased Circle size', 'Advanced Rally planning', 'Shared albums', 'Enhanced event tools'],
      },
      {
        heading: 'Discovery',
        items: ['Advanced venue filters', 'Personal activity history', 'Check-in timeline', 'Travel map'],
      },
      {
        heading: 'Afterglow',
        items: ['Unlimited Afterglow history', 'Download memories', 'Premium recap layouts'],
      },
      {
        heading: 'Insights',
        items: ['Personal statistics', 'Venue history', 'Check-in streaks', 'Achievement system'],
      },
      {
        heading: 'Early Access',
        items: ['Beta features', 'AI venue recommendations', 'AI social recommendations', 'Early feature releases'],
      },
    ],
  },
]

// ── FOUNDING VENUE PROGRAM ──────────────────────────────────────────────────
// Limited-time launch offer, not a recurring Stripe plan — a status a venue is
// granted during onboarding. Kept here so the /pricing screen can surface it.
export const FOUNDING_VENUE_PROGRAM = {
  id: 'founding_venue',
  name: 'Founding Venue Program',
  note: 'Available for a limited time during the launch period.',
  includes: [
    'Free onboarding',
    'No contracts',
    'Grandfathered into the Professional plan for life',
    'Founding Venue badge',
    'Direct input into future feature development',
    'Priority support',
    'Recognition as an original Here(Now) partner',
  ],
}

export const ALL_PLANS: Plan[] = [...VENUE_PLANS, ...ORGANIZATION_PLANS, ...CONSUMER_PLANS]

export function getPlan(id: string): Plan | undefined {
  return ALL_PLANS.find((p) => p.id === id)
}

export function plansFor(audience: Audience): Plan[] {
  return ALL_PLANS.filter((p) => p.audience === audience)
}

// Human-readable price, e.g. "$99/mo", "$7.99/mo", "Free", "Custom".
export function formatPrice(price: PriceModel): string {
  switch (price.kind) {
    case 'free':
      return 'Free'
    case 'custom':
      return 'Custom'
    case 'fixed': {
      const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)
      return `${money(price.monthlyUsd)}/mo`
    }
  }
}

// Optional annual line, e.g. "or $69/year" — empty string when there's no
// annual price on the plan.
export function formatAnnual(price: PriceModel): string {
  if (price.kind === 'fixed' && price.annualUsd != null) {
    return `or $${price.annualUsd}/year`
  }
  return ''
}
