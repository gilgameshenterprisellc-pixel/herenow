import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { Platform, AppState } from 'react-native'
import { supabase } from '@/lib/supabase'
import type { Session, CheckInResult } from '@/lib/sessions'
import { getActiveSession, checkIn as doCheckIn, checkOut as doCheckOut, touchSession, verifyZonePresence } from '@/lib/sessions'
import type { SocialMode, MoodMode } from '@/lib/sessions'
import { notifyAutoCheckout } from '@/lib/notifications'
import { applyPresenceReading } from '@/lib/presence'

interface SessionContextValue {
  activeSession: Session | null
  loading: boolean
  refresh: () => Promise<void>
  checkIn: (zoneId: string, socialModes: SocialMode[], moodMode: MoodMode) => Promise<CheckInResult>
  checkOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({
  activeSession: null,
  loading: true,
  refresh: async () => {},
  checkIn: async () => ({ ok: false, reason: 'failed' }),
  checkOut: async () => {},
})

const AUTO_CHECKOUT_MS = 3 * 60 * 1000  // 3 minutes — prompt leave detection
const HEARTBEAT_MS     = 2 * 60 * 1000  // 2 minutes — keeps presence fresh

// The eviction rule (how many consecutive confirmed-outside reads it takes to
// boot someone, and how 'inside'/'unknown' reset it) lives in lib/presence.ts
// via applyPresenceReading, so it can be unit-tested against simulated GPS
// traces. This provider just holds the running strike count between reads.

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const autoCheckoutTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const outsideStrikes = useRef(0)

  const refresh = useCallback(async () => {
    const session = await getActiveSession()
    setActiveSession(session)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refresh()
    })

    return () => subscription.unsubscribe()
  }, [refresh])

  // Re-sync the session from the server every time the app returns to the
  // foreground. If the background geofence task checked the user out while the
  // app was away, this clears the stale "you're checked in" UI on reopen with no
  // manual refresh — Jacob: "it's hard to know if you're checked in when you
  // reopen the app... I had to refresh the page to realize I was checked out."
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const checkIn = useCallback(async (
    zoneId: string,
    socialModes: SocialMode[],
    moodMode: MoodMode
  ): Promise<CheckInResult> => {
    const result = await doCheckIn({ zoneId, socialModes, moodMode })
    if (result.ok) {
      outsideStrikes.current = 0
      setActiveSession(result.session)
    }
    return result
  }, [])

  // Verify the user is still physically in their checked-in zone; if not, check
  // them out. Runs on a timer AND immediately whenever the app returns to the
  // foreground, so leaving the venue drops you promptly (Jacob safety).
  //
  // Only evicts on repeated, trustworthy "outside" reads. verifyZonePresence
  // applies the same accuracy bar as check-in: a fuzzy fix returns 'unknown', so
  // one bad indoor reading can never boot someone. A confirmed inside read (or an
  // untrusted fix) resets the strike count; eviction needs EVICT_STRIKES in a row.
  const verifyPresenceOrCheckout = useCallback(async () => {
    if (!activeSession || Platform.OS === 'web') return
    try {
      const presence = await verifyZonePresence(activeSession.zone_id)
      // Single source of truth for the eviction rule (tested in isolation):
      // 'inside'/'unknown' reset the count, 'outside' strikes, evict at the cap.
      const { strikes, evict } = applyPresenceReading(outsideStrikes.current, presence)
      outsideStrikes.current = strikes
      if (evict) {
        const evictedId = activeSession.id
        const zoneName = await doCheckOut(evictedId)
        setActiveSession(null)
        // Only notifies if this call actually ended the session — doCheckOut
        // returns null when it was already checked out (e.g. the geofence task
        // beat us to it), so the user never gets two "checked out" alerts.
        if (zoneName) await notifyAutoCheckout(zoneName, evictedId)
      }
    } catch {
      // Location unavailable — skip, try again next tick
    }
  }, [activeSession?.id, activeSession?.zone_id])

  // Presence heartbeat: keep the active session "fresh" so the venue sees you as
  // here. Refreshes every 2 min while the app is open, and immediately whenever
  // the app returns to the foreground. When the app is closed and you've left,
  // heartbeats stop and you drop out of the live count within the staleness
  // window (server-side) — no more ghost check-ins.
  useEffect(() => {
    if (!activeSession) return
    touchSession(activeSession.id).catch(() => {})

    const beat = setInterval(() => { touchSession(activeSession.id).catch(() => {}) }, HEARTBEAT_MS)
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        touchSession(activeSession.id).catch(() => {})
        // Coming back to the app is the moment to catch a missed geofence exit.
        verifyPresenceOrCheckout()
      }
    })

    return () => { clearInterval(beat); appSub.remove() }
  }, [activeSession?.id])

  const checkOut = useCallback(async () => {
    if (!activeSession) return
    await doCheckOut(activeSession.id)
    setActiveSession(null)
  }, [activeSession])

  // Foreground backup: every 10 min, verify user is still in zone; auto-checkout if not.
  // The geofence task handles the background case; this covers foreground scenarios
  // where the OS delays or misses the geofence exit event.
  useEffect(() => {
    if (!activeSession || Platform.OS === 'web') return

    autoCheckoutTimer.current = setInterval(() => { verifyPresenceOrCheckout() }, AUTO_CHECKOUT_MS)

    return () => {
      if (autoCheckoutTimer.current) {
        clearInterval(autoCheckoutTimer.current)
        autoCheckoutTimer.current = null
      }
    }
  }, [activeSession?.id, activeSession?.zone_id])

  return (
    <SessionContext.Provider value={{ activeSession, loading, refresh, checkIn, checkOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionContext() {
  return useContext(SessionContext)
}
