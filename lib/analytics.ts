import { supabase } from './supabase'

// Fire-and-forget product analytics — Jacob's "collect the underlying data from
// day one" call (Q18, July 7 2026). Aggregate-only by design: event name, optional
// zone, small props. Never blocks UX, never throws, silently no-ops if the
// app_events table doesn't exist yet (supabase/jacob_dashboard_events.sql).
export function logEvent(
  event: string,
  props?: { zoneId?: string; [key: string]: unknown }
): void {
  ;(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { zoneId, ...rest } = props ?? {}
      await supabase.from('app_events').insert({
        user_id: user.id,
        event,
        zone_id: zoneId ?? null,
        props: rest,
      })
    } catch {
      // analytics must never surface an error
    }
  })()
}
