import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { Platform, AppState } from 'react-native'
import { supabase } from '@/lib/supabase'
import type { Session, CheckInResult } from '@/lib/sessions'
import { getActiveSession, checkIn as doCheckIn, checkOut as doCheckOut, touchSession, verifyZonePresence } from '@/lib/sessions'
import type { SocialMode, MoodMode } from '@/lib/sessions'

interface SessionContextValue {
  activeSession: Session | null
  loading: boolean
  refresh: () => Promise<void>
  checkIn: (zoneId: string, socialMode: SocialMode, moodMode: MoodMode) => Promise<CheckInResult>
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

// Require this many CONSECUTIVE trustworthy "outside" reads before evicting.
// A single fix is not enough: indoor GPS glitches produce one-off outside reads
// even when the person hasn't moved, which was booting people mid-visit. Any
// confirmed inside read (or an untrusted fix) resets the count. At the 3-min
// cadence, 2 strikes means ~6 minutes of continuous confirmed absence — long
// enough to mean "actually left", short enough to drop a real departure.
const EVICT_STRIKES = 2

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

  const checkIn = useCallback(async (
    zoneId: string,
    socialMode: SocialMode,
    moodMode: MoodMode
  ): Promise<CheckInResult> => {
    const result = await doCheckIn({ zoneId, socialMode, moodMode })
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
      if (presence === 'inside' || presence === 'unknown') {
        outsideStrikes.current = 0
        return
      }
      // presence === 'outside' — trustworthy fix, confirmed out of the zone
      outsideStrikes.current += 1
      if (outsideStrikes.current >= EVICT_STRIKES) {
        outsideStrikes.current = 0
        await doCheckOut(activeSession.id)
        setActiveSession(null)
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
