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

export async function awardBadge(slug: string): Promise<void> {
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
    .upsert({ user_id: user.id, badge_id: badge.id }, { onConflict: 'user_id,badge_id' })

  await supabase.from('notifications').insert({
    user_id: user.id,
    type: 'badge_earned',
    title: 'Badge earned! 🏅',
    body: `You earned a new badge.`,
    data: { badge_slug: slug },
  })
}

export async function checkAndAwardBadges(trigger: 'checkin' | 'wemet_confirmed' | 'pulse_post' | 'chat_message'): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const earned = new Set(
    (await fetchUserBadges(user.id)).map((b) => b.badge.slug)
  )

  if (trigger === 'checkin') {
    if (!earned.has('first_checkin')) await awardBadge('first_checkin')

    const hour = new Date().getHours()
    if (hour >= 0 && hour < 5 && !earned.has('night_owl')) await awardBadge('night_owl')
    if (hour >= 5 && hour < 9 && !earned.has('early_bird')) await awardBadge('early_bird')

    const { count: checkinCount } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((checkinCount ?? 0) >= 5 && !earned.has('venue_explorer')) {
      await awardBadge('venue_explorer')
    }
  }

  if (trigger === 'wemet_confirmed') {
    if (!earned.has('first_wemet')) await awardBadge('first_wemet')

    const { count: wemetCount } = await supabase
      .from('we_met')
      .select('*', { count: 'exact', head: true })
      .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .eq('status', 'confirmed')

    if ((wemetCount ?? 0) >= 5 && !earned.has('social_butterfly')) {
      await awardBadge('social_butterfly')
    }
    if ((wemetCount ?? 0) >= 10 && !earned.has('connector')) {
      await awardBadge('connector')
    }
  }

  if (trigger === 'pulse_post') {
    const { count } = await supabase
      .from('pulse_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= 10 && !earned.has('vibe_setter')) {
      await awardBadge('vibe_setter')
    }
  }

  if (trigger === 'chat_message') {
    const { count } = await supabase
      .from('venue_chat')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= 25 && !earned.has('chat_regular')) {
      await awardBadge('chat_regular')
    }
  }
}
