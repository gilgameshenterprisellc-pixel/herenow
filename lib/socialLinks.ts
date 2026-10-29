// A venue's links to its accounts elsewhere: Instagram, Facebook, TikTok, X
// and its website (Jacob, Oct 28). Optional, display only, no feeds pulled in.
//
// A venue can type a handle ("@lakesidelounge") or paste a link; both are
// stored as one full https URL in zones.social_links. Every stored link is
// checked again before it is shown or opened, because the column is written by
// venue owners: a link only opens if it points at that platform's own site
// (or, for the website, at an ordinary http/https address).
//
// Opening the https profile URL is what sends people into the platform's app
// when it is installed: iOS universal links and Android app links take over,
// and the browser is the fallback. No custom URL schemes needed.
//
// Pure, no imports. Deliberately no `new URL()`: React Native's URL is
// incomplete on some versions (hostname can throw), so this parses by hand.

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'x', 'website'] as const
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number]
export type SocialLinks = Partial<Record<SocialPlatform, string>>

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  x:         'X (Twitter)',
  website:   'Website',
}

export const SOCIAL_PLACEHOLDERS: Record<SocialPlatform, string> = {
  instagram: '@yourvenue or instagram.com/yourvenue',
  facebook:  'facebook.com/yourvenue',
  tiktok:    '@yourvenue or tiktok.com/@yourvenue',
  x:         '@yourvenue or x.com/yourvenue',
  website:   'yourvenue.com',
}

type Network = Exclude<SocialPlatform, 'website'>

const HOSTS: Record<Network, string[]> = {
  instagram: ['instagram.com'],
  facebook:  ['facebook.com', 'fb.com', 'fb.me'],
  tiktok:    ['tiktok.com'],
  x:         ['x.com', 'twitter.com'],
}

const HANDLE: Record<Network, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  facebook:  /^[A-Za-z0-9.]{1,50}$/,
  tiktok:    /^[A-Za-z0-9._]{2,24}$/,
  x:         /^[A-Za-z0-9_]{1,15}$/,
}

const PROFILE: Record<Network, (handle: string) => string> = {
  instagram: h => `https://www.instagram.com/${h}`,
  facebook:  h => `https://www.facebook.com/${h}`,
  tiktok:    h => `https://www.tiktok.com/@${h}`,
  x:         h => `https://x.com/${h}`,
}

interface ParsedUrl { scheme: string; host: string; rest: string }

/** scheme://host[:port]/path?query#hash, or null. Lowercases scheme and host. */
function parseUrl(s: string): ParsedUrl | null {
  const m = s.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#:\s@]+)(?::\d{1,5})?([^\s]*)$/i)
  if (!m) return null
  return { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), rest: m[3] ?? '' }
}

function hostAllowed(host: string, allowed: string[]): boolean {
  return allowed.some(a => host === a || host.endsWith('.' + a))
}

/** A bare "instagram.com/x" gets https:// so it parses; anything with a scheme keeps it. */
function withScheme(s: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
}

export type NormalizeResult = { ok: true; url: string | null } | { ok: false; error: string }

/**
 * What a venue typed, as the URL to store. Empty input is "no link" (url null).
 * A link to the wrong site, or something that is neither a handle nor a link,
 * is an error the form shows next to the field.
 */
export function normalizeSocialInput(platform: SocialPlatform, raw: string): NormalizeResult {
  const v = raw.trim()
  if (!v) return { ok: true, url: null }

  if (platform === 'website') {
    const u = parseUrl(withScheme(v))
    if (!u || (u.scheme !== 'https' && u.scheme !== 'http') || !u.host.includes('.')) {
      return { ok: false, error: "That doesn't look like a web address." }
    }
    return { ok: true, url: `${u.scheme}://${u.host}${u.rest}` }
  }

  const label = SOCIAL_LABELS[platform]
  const looksLikeLink = v.includes('/') || /^[a-z0-9.-]+\.(com|me)$/i.test(v.replace(/^@/, ''))
  if (looksLikeLink) {
    const u = parseUrl(withScheme(v))
    if (!u || (u.scheme !== 'https' && u.scheme !== 'http') || !hostAllowed(u.host, HOSTS[platform])) {
      return { ok: false, error: `That link doesn't go to ${label}.` }
    }
    const path = u.rest.replace(/[?#].*$/, '')
    if (path === '' || path === '/') {
      return { ok: false, error: `Link to your ${label} profile, not the home page.` }
    }
    return { ok: true, url: `https://${u.host}${u.rest}` }
  }

  const handle = v.replace(/^@/, '')
  if (!HANDLE[platform].test(handle)) {
    return { ok: false, error: `Enter your ${label} @handle or a link to the profile.` }
  }
  return { ok: true, url: PROFILE[platform](handle) }
}

/** A stored link, re-checked. Null when it should not be shown or opened. */
export function safeSocialUrl(platform: SocialPlatform, stored: unknown): string | null {
  if (typeof stored !== 'string') return null
  const u = parseUrl(stored.trim())
  if (!u) return null
  if (platform === 'website') {
    return (u.scheme === 'https' || u.scheme === 'http') && u.host.includes('.') ? stored.trim() : null
  }
  return u.scheme === 'https' && hostAllowed(u.host, HOSTS[platform]) ? stored.trim() : null
}

/** The links a venue profile shows, in a fixed order, skipping blank or unsafe ones. */
export function readSocialLinks(raw: unknown): { platform: SocialPlatform; url: string }[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const obj = raw as Record<string, unknown>
  return SOCIAL_PLATFORMS.flatMap(platform => {
    const url = safeSocialUrl(platform, obj[platform])
    return url ? [{ platform, url }] : []
  })
}

/**
 * Every field of a form, cleaned. Errors are keyed by platform so the form can
 * mark the field; `links` holds only the platforms that have a link.
 */
export function normalizeSocialForm(
  inputs: Partial<Record<SocialPlatform, string>>,
): { links: SocialLinks; errors: Partial<Record<SocialPlatform, string>> } {
  const links: SocialLinks = {}
  const errors: Partial<Record<SocialPlatform, string>> = {}
  for (const platform of SOCIAL_PLATFORMS) {
    const r = normalizeSocialInput(platform, inputs[platform] ?? '')
    if (!r.ok) errors[platform] = r.error
    else if (r.url) links[platform] = r.url
  }
  return { links, errors }
}

/** Stored links back into editable text: the full URL, so nothing is lost. */
export function socialInputsFrom(raw: unknown): Record<SocialPlatform, string> {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const out = {} as Record<SocialPlatform, string>
  for (const p of SOCIAL_PLATFORMS) out[p] = typeof obj[p] === 'string' ? obj[p] as string : ''
  return out
}
