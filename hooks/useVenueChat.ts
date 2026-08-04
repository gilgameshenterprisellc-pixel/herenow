import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchChat } from '@/lib/chat'
import type { ChatMessage } from '@/lib/chat'

export function useVenueChat(zoneId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await fetchChat(zoneId)
    setMessages(data)
    setLoading(false)
  }, [zoneId])

  useEffect(() => {
    refresh()

    // Unique per-mount topic: supabase-js dedupes channels by topic, so a fast
    // remount reusing `chat:<zone>` can hand back an already-subscribed channel
    // and make the .on() below throw "cannot add ... after subscribe()". See
    // usePulse for the full write-up. The zone_id filter scopes the data.
    const channel = supabase
      .channel(`chat:${zoneId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'venue_chat', filter: `zone_id=eq.${zoneId}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [zoneId, refresh])

  return { messages, loading, refresh }
}
