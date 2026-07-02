import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import type { Session, CheckInResult } from '@/lib/sessions'
import { getActiveSession, checkIn as doCheckIn, checkOut as doCheckOut } from '@/lib/sessions'
import type { SocialMode, MoodMode } from '@/lib/sessions'
import { getCurrentCoords } from '@/lib/location'
import { checkUserInZone } from '@/lib/zones'

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

const AUTO_CHECKOUT_MS = 10 * 60 * 1000 // 10 minutes

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const autoCheckoutTimer = useRef<ReturnType<typeof setInterval> | null>(null)

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
    if (result.ok) setActiveSession(result.session)
    return result
  }, [])

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

    autoCheckoutTimer.current = setInterval(async () => {
      try {
        const coords = await getCurrentCoords()
        if (!coords) return
        const stillInZone = await checkUserInZone(activeSession.zone_id, coords.latitude, coords.longitude)
        if (!stillInZone) {
          await doCheckOut(activeSession.id)
          setActiveSession(null)
        }
      } catch {
        // Location unavailable — skip this tick, try again next interval
      }
    }, AUTO_CHECKOUT_MS)

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
