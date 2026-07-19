import type { ComponentProps } from 'react'
import { Ionicons } from '@expo/vector-icons'

/**
 * Icon vocabulary for HereNow.
 *
 * Emoji render as full-colour cartoon glyphs that sit at whatever weight the
 * system font decides, so a screen full of them reads as clip art rather than
 * as an interface. Ionicons are single-colour vector marks: they inherit our
 * palette, align on the text baseline, and scale cleanly on every density.
 *
 * Ionicons specifically (not a new dependency) because @expo/vector-icons is
 * already installed and already used in 15 places. Adding an icon library right
 * before the Martha's beta would mean new native surface area next to the
 * worklets pin that stabilised the launch crash. Not worth it for glyphs.
 */
export type IconName = ComponentProps<typeof Ionicons>['name']

/* ── Badges ────────────────────────────────────────────────────────────────
   Keyed in CODE rather than migrating the `badges.icon` column, deliberately:
   a SQL migration against a live table is irreversible-ish and untestable
   locally, while a lookup here is a one-line revert. The DB keeps its emoji as
   a harmless fallback for any badge added later that isn't mapped yet. */
const BADGE_ICONS: Record<string, IconName> = {
  // courage
  courage: 'flash',
  // kindness
  good_vibes_only: 'happy',
  chat_regular: 'chatbubbles',
  // exploration
  explorer: 'map',
  explorer_ii: 'compass',
  explorer_iii: 'globe',
  adventurer: 'earth',
  night_owl: 'moon',
  night_owl_ii: 'moon',
  early_bird: 'sunny',
  // connection
  social_butterfly: 'people-circle',
  the_handshake: 'hand-left',
  social_legend: 'star',
  connector: 'git-network',
  // presence
  founding_member: 'ribbon',
  regular: 'home',
  vibe_setter: 'sparkles',
  pulse_master: 'pulse',
  photographer: 'camera',
  first_steps: 'walk',
}

/** Fallback per category, so an unmapped badge still gets a real mark. */
const CATEGORY_ICONS: Record<string, IconName> = {
  courage: 'flash',
  kindness: 'heart',
  exploration: 'compass',
  connection: 'people',
  presence: 'star',
}

const normalise = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/**
 * Resolve a badge to an icon. Tries slug, then name (venue-specific badges like
 * "Martha My Dear Regular" are named per venue and will never match a slug), then
 * category, then a generic medal.
 */
export function badgeIcon(
  slug?: string | null,
  name?: string | null,
  category?: string | null
): IconName {
  if (slug && BADGE_ICONS[normalise(slug)]) return BADGE_ICONS[normalise(slug)]
  if (name) {
    const n = normalise(name)
    if (BADGE_ICONS[n]) return BADGE_ICONS[n]
    // "Martha My Dear Regular" -> regular, "Explorer III" -> explorer_iii
    const tail = n.split('_').slice(-1)[0]
    if (BADGE_ICONS[tail]) return BADGE_ICONS[tail]
    if (n.endsWith('_regular')) return BADGE_ICONS.regular
  }
  if (category && CATEGORY_ICONS[normalise(category)]) {
    return CATEGORY_ICONS[normalise(category)]
  }
  return 'medal'
}

export function badgeCategoryIcon(category: string): IconName {
  return CATEGORY_ICONS[normalise(category)] ?? 'medal'
}

/* ── Event types ──────────────────────────────────────────────────────────── */
export const EVENT_TYPE_ICONS: Record<string, IconName> = {
  music: 'musical-notes',
  trivia: 'bulb',
  happy_hour: 'beer',
  happyhour: 'beer',
  sports: 'basketball',
  comedy: 'happy',
  karaoke: 'mic',
  general: 'calendar',
}

export function eventTypeIcon(type?: string | null): IconName {
  if (!type) return 'calendar'
  return EVENT_TYPE_ICONS[normalise(type)] ?? 'calendar'
}

/* ── Shared UI marks ──────────────────────────────────────────────────────
   Named by MEANING, not by the emoji they replace, so call sites read as intent
   ("icon for the board") rather than as a translation table. */
export const UI: Record<string, IconName> = {
  admin: 'shield-checkmark',
  venueApprovals: 'business',
  venueSuggestions: 'map',
  reports: 'flag',
  users: 'people',
  surveys: 'clipboard',

  board: 'pin',
  pulse: 'flame',
  chat: 'chatbubbles',
  message: 'chatbubble-ellipses',
  people: 'people',
  events: 'calendar',
  manageEvents: 'calendar-number',
  addEvent: 'add-circle',
  editVenue: 'create',
  highlights: 'star',
  promotions: 'pricetag',
  announce: 'megaphone',
  gallery: 'images',
  tonightsScene: 'map',
  nightlyRecap: 'moon',
  livePeople: 'people-circle',
  organizations: 'people-circle',
  privacy: 'lock-closed',
  wave: 'hand-left',
  badge: 'medal',
  connection: 'radio',
  handshake: 'hand-left',
  checkIn: 'location',
  photo: 'camera',
  endTime: 'flag-outline',

  person: 'person',
  venue: 'business',
  email: 'mail',
  phone: 'call',
  eye: 'eye',
  empty: 'ellipse-outline',
}
