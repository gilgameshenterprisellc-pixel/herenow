import { supabase } from './supabase'
import { paramsFrom } from './authLinkParams'

export { isAuthLink } from './authLinkParams'

// Turning a Supabase auth email link into a real session.
//
// Nothing in the app did this. "Forgot password" sent a link, the link opened
// the app, and the tokens it carried were dropped on the floor — so
// reset-password.tsx called updateUser({ password }) with no session behind it
// and failed every time (Jacob, Aug 2026). The client also sets
// detectSessionInUrl: false, so the web build didn't pick them up either.
//
// Supabase can hand the tokens back two different ways depending on the flow,
// and a link in the wild may be either:
//
//   implicit  herenow://reset-password#access_token=…&refresh_token=…&type=recovery
//   pkce      herenow://reset-password?code=…
//
// Both are handled. The URL parsing lives in lib/authLinkParams.ts so it can be
// unit-tested without dragging supabase/react-native into the test runner.

export type AuthLinkResult =
  | 'recovery'   // session established, and it came from a password-reset link
  | 'signed_in'  // session established from some other auth link
  | 'none'       // nothing auth-related in this URL
  | 'error'      // link carried an error, or was expired/already used

export async function consumeAuthLink(url: string | null | undefined): Promise<AuthLinkResult> {
  if (!url) return 'none'
  const p = paramsFrom(url)

  // Expired or already-used links come back as an error in the fragment rather
  // than as a failed exchange. Surface it instead of showing a dead form.
  if (p.error || p.error_description) return 'error'

  if (p.access_token && p.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token:  p.access_token,
      refresh_token: p.refresh_token,
    })
    if (error) return 'error'
    return p.type === 'recovery' ? 'recovery' : 'signed_in'
  }

  if (p.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(p.code)
    if (error) return 'error'
    // A PKCE code doesn't say what it was for. The PASSWORD_RECOVERY event from
    // onAuthStateChange is what routes recovery links in that flow.
    return 'signed_in'
  }

  return 'none'
}

// Strip auth tokens out of the web address bar once they're spent, so a
// refresh, a bookmark, or a shared URL can't replay them.
export function scrubAuthParamsFromUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  window.history.replaceState(null, '', window.location.pathname)
}
