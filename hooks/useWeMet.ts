import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchPendingWeMets, fetchConfirmedWeMets } from '@/lib/weMet'
import type { WeMet } from '@/lib/weMet'

export function useWeMet() {
  const [pending, setPending] = useState<WeMet[]>([])
  const [confirmed, setConfirmed] = useState<WeMet[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [p, c] = await Promise.all([
      fetchPendingWeMets(),
      fetchConfirmedWeMets(),
    ])
    setPending(p)
    setConfirmed(c)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (_, sess) => {
      if (!sess) return
      const channel = supabase
        .channel('we_met_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'we_met' },
          () => refresh()
        )
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    })

    return () => authSub.unsubscribe()
  }, [refresh])

  return { pending, confirmed, loading, refresh }
}
