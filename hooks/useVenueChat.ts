import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchChat } from '@/lib/chat'
import { fetchBlockedIds } from '@/lib/blocks'
import type { ChatMessage } from '@/lib/chat'

export function useVenueChat(zoneId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  // Who I have blocked, so a live message from them is dropped instead of
  // appearing until the next refresh. The database filters these too.
  const blockedRef = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    const [data, blocked] = await Promise.all([fetchChat(zoneId), fetchBlockedIds()])
    blockedRef.current = new Set(blocked)
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
          if (blockedRef.current.has(newMsg.user_id)) return
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
