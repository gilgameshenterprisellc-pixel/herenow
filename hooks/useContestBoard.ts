import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { supabase } from '@/lib/supabase'
import { fetchContestBoard, fetchVenueContests, type Contest, type ContestBoard } from '@/lib/contests'

// Live contest data for a screen. Three ways it stays current, because a
// bar's Wi-Fi and cell signal drop the live connection all the time:
//   1. Realtime: every write bumps the contest row, which reloads the board.
//   2. A poll every 15 seconds, in case the socket died quietly.
//   3. A reload whenever the app comes back to the foreground.
// Reloads are coalesced and an older response never overwrites a newer one.

const POLL_MS = 15_000
// Every phone in the room hears the same change at the same moment. A short
// random wait spreads their reloads out instead of all hitting at once.
const COALESCE_MS = 150
const JITTER_MS = 600

export function useContestBoard(contestId: string | undefined) {
  const [board, setBoard] = useState<ContestBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (!contestId) return
    const mine = ++seq.current
    const res = await fetchContestBoard(contestId)
    if (mine !== seq.current) return // a newer request already answered
    if (res.ok) {
      setBoard(res.data ?? null)
      setGone(!res.data)
      setError(null)
    } else {
      // Keep showing the last good board; just say it may be stale.
      setError(res.error ?? null)
    }
    setLoading(false)
  }, [contestId])

  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; refresh() }, COALESCE_MS + Math.random() * JITTER_MS)
  }, [refresh])

  useEffect(() => {
    if (!contestId) return
    setLoading(true)
    refresh()

    // Unique topic per mount; see useVenueChat for why.
    const channel = supabase
      .channel(`contest:${contestId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contests', filter: `id=eq.${contestId}` },
        () => soon())
      .subscribe()

    const poll = setInterval(refresh, POLL_MS)
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') refresh() })

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
      app.remove()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [contestId, refresh, soon])

  return { board, loading, gone, error, refresh }
}

/** The contests at one venue, for its LIVE card. Same staying-current rules. */
export function useVenueContests(zoneId: string | undefined) {
  const [contests, setContests] = useState<Contest[]>([])
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (!zoneId) return
    const mine = ++seq.current
    const rows = await fetchVenueContests(zoneId)
    if (mine === seq.current) setContests(rows)
  }, [zoneId])

  useEffect(() => {
    if (!zoneId) return
    refresh()
    // A running contest changes every few seconds; the card only needs the
    // gist, so bursts collapse into one reload a second.
    const soon = () => {
      if (timer.current) return
      timer.current = setTimeout(() => { timer.current = null; refresh() }, 1000)
    }
    const channel = supabase
      .channel(`contests:${zoneId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contests', filter: `zone_id=eq.${zoneId}` },
        soon)
      .subscribe()
    const poll = setInterval(refresh, 60_000)
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') refresh() })
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
      app.remove()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [zoneId, refresh])

  return { contests, refresh }
}
