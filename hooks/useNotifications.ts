import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchNotifications, getUnreadCount } from '@/lib/notifications'
import type { Notification } from '@/lib/notifications'

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [data, count] = await Promise.all([fetchNotifications(), getUnreadCount()])
    setNotifications(data)
    setUnreadCount(count)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => refresh()
        )
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }

    setupRealtime()
  }, [refresh])

  return { notifications, unreadCount, loading, refresh }
}
