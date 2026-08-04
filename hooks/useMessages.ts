import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchMessages, fetchDmThreads } from '@/lib/messages'
import type { DirectMessage, DmThread } from '@/lib/messages'

export function useDmThread(wemetId: string, _currentUserId?: string) {
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [loading, setLoading]   = useState(true)

  const refresh = useCallback(async () => {
    const data = await fetchMessages(wemetId)
    setMessages(data)
    setLoading(false)
  }, [wemetId])

  useEffect(() => {
    refresh()

    // Unique per-mount topic — supabase-js dedupes by topic, so reusing
    // `dm:<wemetId>` on a fast remount can throw "cannot add ... after
    // subscribe()". See usePulse. The we_met_id filter scopes the data.
    const channel = supabase
      .channel(`dm:${wemetId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `we_met_id=eq.${wemetId}` },
        (payload) => {
          setMessages((prev) => {
            const msg = payload.new as DirectMessage
            if (prev.find((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [wemetId, refresh])

  return { messages, loading, refresh }
}

export function useDmThreads(_userId?: string) {
  const [threads, setThreads] = useState<DmThread[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await fetchDmThreads()
    setThreads(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { threads, loading, refresh }
}
