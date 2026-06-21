import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchPulse } from '@/lib/pulse'
import type { PulsePost } from '@/lib/pulse'

export function usePulse(zoneId: string) {
  const [posts, setPosts] = useState<PulsePost[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await fetchPulse(zoneId)
    setPosts(data)
    setLoading(false)
  }, [zoneId])

  useEffect(() => {
    refresh()

    const channel = supabase
      .channel(`pulse:${zoneId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pulse_posts', filter: `zone_id=eq.${zoneId}` },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pulse_posts', filter: `zone_id=eq.${zoneId}` },
        () => refresh()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [zoneId, refresh])

  return { posts, loading, refresh }
}
