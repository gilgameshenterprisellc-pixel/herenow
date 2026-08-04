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

    // supabase-js dedupes channels by topic. If a channel with this topic is
    // still registered — a fast remount's async removeChannel hasn't finished,
    // StrictMode, or hot reload — supabase.channel() hands back the EXISTING,
    // already-subscribed channel, and the .on('postgres_changes') calls below
    // then throw "cannot add postgres_changes callbacks ... after subscribe()".
    // That crashed the venue page right after check-in (router.replace into the
    // zone screen remounts this hook). A per-mount-unique topic guarantees a
    // fresh channel every time; the postgres_changes filter (zone_id) is what
    // scopes the data, not the topic name. Cleanup removes this exact instance.
    const channel = supabase
      .channel(`pulse:${zoneId}:${Math.random().toString(36).slice(2)}`)
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
