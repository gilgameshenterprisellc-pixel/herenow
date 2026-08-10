// Pulling the auth material out of a Supabase redirect URL.
//
// Kept free of supabase/react-native imports so it can be unit-tested
// (test/auth-links.test.ts). lib/authLinks.ts does the session work.
//
// Parsed by hand rather than with `new URL()`. Custom schemes plus Hermes'
// partial URL support is not a combination worth trusting, and this codebase
// already shipped one Hermes-only bug this month by assuming an engine API
// behaved the same everywhere (see lib/nights.ts). Getting this wrong means a
// silently dead password-reset link, which is precisely the bug being fixed.

export interface AuthLinkParams {
  access_token?: string
  refresh_token?: string
  code?: string
  type?: string
  error?: string
  error_description?: string
  [key: string]: string | undefined
}

// Every key=value pair in the query string AND the fragment, decoded. Supabase
// uses the fragment for the implicit flow and the query for PKCE, and a link in
// the wild may be either, so both are read.
export function paramsFrom(url: string): AuthLinkParams {
  const out: AuthLinkParams = {}
  const q = url.indexOf('?')
  const h = url.indexOf('#')
  const chunks: string[] = []
  if (q >= 0) chunks.push(url.slice(q + 1, h > q ? h : undefined))
  if (h >= 0) chunks.push(url.slice(h + 1, q > h ? q : undefined))

  for (const chunk of chunks) {
    for (const pair of chunk.split('&')) {
      if (!pair) continue
      const eq = pair.indexOf('=')
      if (eq < 0) continue
      try {
        out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1))
      } catch {
        // A malformed escape shouldn't take the whole link down.
      }
    }
  }
  return out
}

// Does this URL carry auth material at all? Lets callers skip the work — and
// the address-bar cleanup — for ordinary deep links.
export function isAuthLink(url: string | null | undefined): boolean {
  if (!url) return false
  const p = paramsFrom(url)
  return !!(p.access_token || p.code || p.error || p.error_description)
}
