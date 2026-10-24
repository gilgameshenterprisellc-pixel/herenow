import type { Session, SupabaseClient } from '@supabase/supabase-js'

// Following the signed-in session without freezing supabase-js.
//
// supabase-js waits for every onAuthStateChange listener to finish before its
// startup finishes, and every query waits for startup before it is sent. So a
// listener that awaits a query is waiting on itself, forever. That is what
// froze the launch screen for Jacob on release day (Oct 14 2026) and then for
// Jamie: the app opened with a saved session whose access token had expired
// (anyone who has not opened it for an hour, after iOS or a swipe closed it),
// supabase-js refreshed the token during startup and announced TOKEN_REFRESHED,
// and the ban check in hooks/useAuth.ts awaited a profiles query inside that
// listener. Nothing errors and nothing times out. The spinner never stops, and
// every other query in the app hangs behind it.
//
// Two rules follow:
//   1. A listener never awaits a Supabase call. It hands the work to the next
//      tick (setTimeout 0), as the Supabase docs prescribe.
//   2. Nothing the launch screen waits on may wait forever. The ban check gets
//      a few seconds. If it cannot answer in time the person goes in, the check
//      keeps running and signs a banned account out itself when it lands, and
//      the server blocks a banned account's writes either way.
//
// Kept free of react-native imports so test/auth-watch.test.ts can run it
// against the real supabase-js with a mocked network.

export const BAN_CHECK_TIMEOUT_MS = 5000

export interface AuthWatchOptions {
  // Resolves true when the account is banned (and has been signed out).
  isBanned: (session: Session | null) => Promise<boolean>
  // The session the app should act on; null means signed out or banned.
  onSession: (session: Session | null) => void
  banCheckTimeoutMs?: number
}

// Reports the session once at startup and again after every auth event.
// Returns the unsubscribe function.
export function watchAuth(client: Pick<SupabaseClient, 'auth'>, options: AuthWatchOptions): () => void {
  const { isBanned, onSession, banCheckTimeoutMs = BAN_CHECK_TIMEOUT_MS } = options
  let stopped = false
  let latest = 0

  const apply = async (session: Session | null) => {
    const mine = ++latest
    const banned = await withTimeout(isBanned(session), banCheckTimeoutMs, false)
    // Only the newest event decides what the app shows, so a slow check for an
    // older event cannot undo a sign-out that came after it.
    if (stopped || mine !== latest) return
    onSession(banned ? null : session)
  }

  client.auth.getSession().then(
    ({ data: { session } }) => apply(session),
    () => apply(null),
  )

  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => { if (!stopped) apply(session) }, 0)
  })

  return () => {
    stopped = true
    subscription.unsubscribe()
  }
}

// Settles with `fallback` if the promise has not settled within `ms`, or rejects.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      () => { clearTimeout(timer); resolve(fallback) },
    )
  })
}
