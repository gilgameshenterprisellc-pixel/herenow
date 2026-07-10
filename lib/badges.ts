import { supabase } from './supabase'

export interface Badge {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  category: 'courage' | 'kindness' | 'exploration' | 'connection' | 'presence'
}

export interface UserBadge {
  id: string
  user_id: string
  badge_id: string
  earned_at: string
  meta: Record<string, string> | null
  badge: Badge
}

export async function fetchAllBadges(): Promise<Badge[]> {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .order('category')

  if (error) {
    console.error('[badges] fetchAllBadges error:', error.message)
    return []
  }

  return data ?? []
}

export async function fetchUserBadges(userId?: string): Promise<UserBadge[]> {
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id
  if (!uid) return []

  const { data, error } = await supabase
    .from('user_badges')
    .select('*, badge:badges(*)')
    .eq('user_id', uid)
    .order('earned_at', { ascending: false })

  if (error) {
    console.error('[badges] fetchUserBadges error:', error.message)
    return []
  }

  return data ?? []
}

export async function awardBadge(slug: string, meta?: Record<string, string>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: badge } = await supabase
    .from('badges')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!badge) return

  await supabase
    .from('user_badges')
    .upsert(
      { user_id: user.id, badge_id: badge.id, meta: meta ?? null },
      { onConflict: 'user_id,badge_id' },
    )

  await supabase.from('notifications').insert({
    user_id: user.id,
    type: 'badge_earned',
    title: 'Badge earned! 🏅',
    body: `You earned a new badge.`,
    data: { badge_slug: slug },
  })
}

export async function checkAndAwardBadges(
  trigger: 'checkin' | 'wemet_confirmed' | 'pulse_post' | 'chat_message' | 'gallery_upload',
  opts?: { zoneId?: string }
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const earned = new Set(
    (await fetchUserBadges(user.id)).map((b) => b.badge.slug)
  )

  if (trigger === 'checkin') {
    const hour = new Date().getHours()
    if (hour >= 0 && hour < 5 && !earned.has('night_owl')) await awardBadge('night_owl')
    if (hour >= 5 && hour < 9 && !earned.has('early_bird')) await awardBadge('early_bird')

    // Single query — get zone_id + checked_in_at so we can compute all thresholds in JS.
    // Using .lt('extract(...)') is invalid PostgREST syntax; JS filtering avoids that.
    const { data: sessions, count: checkinCount } = await supabase
      .from('sessions')
      .select('zone_id, checked_in_at', { count: 'exact' })
      .eq('user_id', user.id)

    const total = checkinCount ?? 0
    const rows  = sessions ?? []
    const distinctVenues = new Set(rows.map((s: any) => s.zone_id)).size

    if (total >= 1  && !earned.has('first_checkin'))  await awardBadge('first_checkin')

    // "Explorer" badges count DISTINCT venues visited, not raw check-ins.
    // 5 check-ins at one bar is not "5 different venues" (Jacob feedback 6).
    if (distinctVenues >= 3  && !earned.has('adventurer'))     await awardBadge('adventurer')
    if (distinctVenues >= 5  && !earned.has('venue_explorer')) await awardBadge('venue_explorer')
    if (distinctVenues >= 15 && !earned.has('explorer_ii'))    await awardBadge('explorer_ii')
    if (distinctVenues >= 50 && !earned.has('explorer_iii'))   await awardBadge('explorer_iii')

    // Venue Regular: 5+ check-ins at the same venue — stores zone name in meta
    if (opts?.zoneId && !earned.has('venue_regular')) {
      const venueCount = rows.filter((s: any) => s.zone_id === opts.zoneId).length
      if (venueCount >= 5) {
        const { data: zone } = await supabase
          .from('zones')
          .select('name')
          .eq('id', opts.zoneId)
          .maybeSingle()
        await awardBadge('venue_regular', zone ? { zone_name: zone.name } : undefined)
      }
    }

    // Night Owl II: 5+ check-ins between midnight and 5am — computed in JS from fetched rows
    if (!earned.has('night_regular')) {
      const nightCount = rows.filter((s: any) => {
        const h = new Date(s.checked_in_at).getHours()
        return h >= 0 && h < 5
      }).length
      if (nightCount >= 5) await awardBadge('night_regular')
    }
  }

  if (trigger === 'wemet_confirmed') {
    if (!earned.has('first_wemet')) await awardBadge('first_wemet')

    const { count: wemetCount } = await supabase
      .from('we_met')
      .select('*', { count: 'exact', head: true })
      .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .eq('status', 'confirmed')

    if ((wemetCount ?? 0) >= 5  && !earned.has('social_butterfly')) await awardBadge('social_butterfly')
    if ((wemetCount ?? 0) >= 10 && !earned.has('connector'))        await awardBadge('connector')
    if ((wemetCount ?? 0) >= 25 && !earned.has('social_legend'))    await awardBadge('social_legend')
  }

  if (trigger === 'pulse_post') {
    const { count } = await supabase
      .from('pulse_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= 10 && !earned.has('vibe_setter'))  await awardBadge('vibe_setter')
    if ((count ?? 0) >= 50 && !earned.has('pulse_master')) await awardBadge('pulse_master')
  }

  if (trigger === 'chat_message') {
    const { count } = await supabase
      .from('venue_chat')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= 25 && !earned.has('chat_regular')) await awardBadge('chat_regular')
  }

  if (trigger === 'gallery_upload') {
    if (!earned.has('first_gallery')) await awardBadge('first_gallery')
  }
}
