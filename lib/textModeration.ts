// First-pass text content filter for user posts (Pulse) and chat messages.
// Blocks profanity, slurs, and hate at the point of posting so it never lands
// (Joshua: no profanity, no hate, no bullying — flag and remove immediately).
//
// Word-list + leet-normalization with whole-word matching to keep false
// positives low (so "class"/"assess" are never flagged). It won't catch every
// creative evasion; venue moderators (the ✕) + report/auto-hide cover the rest.
// This is intentionally client-enforced in the post/chat lib calls below.

// Common leet / symbol substitutions, so "sh1t" / "f*ck" / "@ss" normalize.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i', '*': '', '.': '', '_': '', '-': '',
}

function normalize(word: string): string {
  let w = word.toLowerCase()
  w = w.replace(/[0134579@$!*._-]/g, (c) => LEET[c] ?? c)
  w = w.replace(/[^a-z]/g, '')          // drop anything left that isn't a letter
  w = w.replace(/(.)\1{2,}/g, '$1$1')   // collapse 3+ repeats: "shiiiit" -> "shiit"
  return w
}

// Profanity (whole-word). Kept to unambiguous terms to avoid false positives.
const PROFANITY = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'cunt', 'asshole', 'dickhead', 'bastard', 'slut', 'whore', 'jackass',
  'douchebag', 'prick', 'wanker',
]

// Slurs / hate (whole-word). Blocking these is the "no hate, auto-delete" rule.
const SLURS = [
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'tranny',
  'kike', 'spic', 'chink', 'gook', 'wetback', 'coon', 'dyke', 'beaner',
]

const BANNED = new Set([...PROFANITY, ...SLURS].map(normalize))

export interface TextScreen {
  ok: boolean
  category?: 'profanity' | 'hate'
}

const SLUR_SET = new Set(SLURS.map(normalize))

// Returns { ok: false, category } when the text contains blocked language.
export function screenText(text: string): TextScreen {
  if (!text) return { ok: true }
  const tokens = text.split(/\s+/).map(normalize).filter(Boolean)
  for (const t of tokens) {
    if (BANNED.has(t)) {
      return { ok: false, category: SLUR_SET.has(t) ? 'hate' : 'profanity' }
    }
  }
  return { ok: true }
}

// User-facing message for a blocked post/message.
export function blockedMessage(category?: 'profanity' | 'hate'): string {
  return category === 'hate'
    ? 'That was blocked — hate speech and slurs are not allowed here.'
    : 'That was blocked — please keep it respectful (no profanity).'
}
