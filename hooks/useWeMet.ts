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

    let channel: ReturnType<typeof supabase.channel> | null = null

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_, sess) => {
      if (!sess) return
      if (channel) return // already subscribed
      channel = supabase
        .channel('we_met_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'we_met' },
          () => refresh()
        )
        .subscribe()
    })

    return () => {
      authSub.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [refresh])

  return { pending, confirmed, loading, refresh }
}
