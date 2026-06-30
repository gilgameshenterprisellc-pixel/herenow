import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session, CheckInResult } from '@/lib/sessions'
import { getActiveSession, checkIn as doCheckIn, checkOut as doCheckOut } from '@/lib/sessions'
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <SessionContext.Provider value={{ activeSession, loading, refresh, checkIn, checkOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionContext() {
  return useContext(SessionContext)
}
