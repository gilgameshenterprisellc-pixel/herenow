import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { Platform, AppState } from 'react-native'
import { supabase } from '@/lib/supabase'
import type { Session, CheckInResult } from '@/lib/sessions'
import { getActiveSession, checkIn as doCheckIn, checkOut as doCheckOut, touchSession, verifyZonePresence } from '@/lib/sessions'
import type { SocialMode, MoodMode } from '@/lib/sessions'
import { notifyAutoCheckout, notifyLeavingGeofence } from '@/lib/notifications'
import { applyPresenceTick } from '@/lib/presence'
import { refreshGeofences } from '@/hooks/useGeofenceTask'

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

// One loop does presence + heartbeat together (see presenceTick). Every tick
// takes a fresh fix and only refreshes last_seen_at when the user is actually
// here — so leaving (or reopening at home) stops the heartbeat instead of
// keeping a ghost in the room.
const PRESENCE_TICK_MS = 150 * 1000  // 2.5 minutes

// The presence rules (when a confirmed-outside read strikes toward eviction, and
// when an 'inside'/'unknown' read refreshes the heartbeat) live in lib/presence.ts
// via applyPresenceTick, so they can be unit-tested against simulated GPS traces.
// This provider just holds the running strike count between reads.

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
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
      // Re-sync the background exit rings so THIS venue is monitored right away.
      // Without it a first-ever check-in here has no background ring until the
      // next app restart, so auto-checkout wouldn't fire if the app is closed.
      refreshGeofences().catch(() => {})
    }
    return result
  }, [])

  // Presence + heartbeat in one pass. Takes a fresh, accuracy-gated fix and:
  //   • refreshes last_seen_at ONLY when the fix (or an unknown fix with no recent
  //     outside evidence) says you're still here — this is the fix for ghost
  //     check-ins and the "reopened the app at home and I'm still checked in"
  //     case: presence is asserted by GPS, not by the app being open;
  //   • strikes toward eviction on a confirmed-outside read and checks you out on
  //     the second one (loose out: a single jittery outside never boots you).
  // Runs on the timer AND on every foreground, on web too (web has no background
  // geofence, so this loop is the only auto-checkout web users get). verifyZone-
  // Presence returns 'unknown' for any fix we don't trust, so a flaky web/GPS
  // reading can never falsely evict — only a confirmed-outside does.
  const presenceTick = useCallback(async () => {
    if (!activeSession) return
    try {
      const reading = await verifyZonePresence(activeSession.zone_id)
      const { strikes, evict, touch } = applyPresenceTick(outsideStrikes.current, reading)
      outsideStrikes.current = strikes

      if (touch) touchSession(activeSession.id).catch(() => {})

      if (evict) {
        const evictedId = activeSession.id
        const zoneName = await doCheckOut(evictedId)
        setActiveSession(null)
        // Only notifies if this call actually ended the session — doCheckOut
        // returns null when it was already checked out (e.g. the geofence task
        // beat us to it), so the user never gets two "checked out" alerts. Push
        // is native-only.
        if (zoneName && Platform.OS !== 'web') await notifyAutoCheckout(zoneName, evictedId)
      } else if (strikes === 1 && Platform.OS !== 'web') {
        // First confirmed 'outside' read. Warn before the next strike checks them
        // out, so someone who just stepped outside can head back (Jacob's ask: a
        // grace window and a heads-up, not an instant boot at the perimeter).
        // Eviction still needs the second strike, so this never ends a session.
        const { data: z } = await supabase
          .from('zones').select('name').eq('id', activeSession.zone_id).maybeSingle()
        await notifyLeavingGeofence((z as any)?.name ?? null)
      }
    } catch {
      // Location unavailable — skip, try again next tick
    }
  }, [activeSession?.id, activeSession?.zone_id])

  // The single presence loop: heartbeat + auto-checkout together. Runs once on a
  // fresh check-in / session load (so last_seen_at is confirmed by a real fix
  // right away), then every PRESENCE_TICK_MS, and on every foreground return —
  // reopening the app is exactly the moment to catch a departure the OS missed.
  // Runs on web too: web has no background geofence, so this is web's only
  // auto-checkout, and it's why a web tab left open at home no longer keeps you
  // in the room (the fix reads 'outside' and stops touching, then evicts).
  useEffect(() => {
    if (!activeSession) return
    presenceTick()

    const beat = setInterval(() => { presenceTick() }, PRESENCE_TICK_MS)
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') presenceTick()
    })

    return () => { clearInterval(beat); appSub.remove() }
  }, [activeSession?.id, presenceTick])

  const checkOut = useCallback(async () => {
    if (!activeSession) return
    await doCheckOut(activeSession.id)
    setActiveSession(null)
  }, [activeSession])

  return (
    <SessionContext.Provider value={{ activeSession, loading, refresh, checkIn, checkOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionContext() {
  return useContext(SessionContext)
}
