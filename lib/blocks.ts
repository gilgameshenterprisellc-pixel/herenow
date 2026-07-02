import { supabase } from './supabase'

export async function blockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('user_blocks').insert({
    blocker_id: user.id,
    blocked_id: blockedId,
  })

  if (error) {
    console.error('[blocks] blockUser error:', error.message)
    throw new Error(error.message)
  }
}

export async function unblockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)

  if (error) {
    console.error('[blocks] unblockUser error:', error.message)
    throw new Error(error.message)
  }
}

export async function fetchBlockedIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Mutual blocking: users I blocked + users who blocked me both disappear
  const [outgoing, incoming] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', user.id),
  ])

  const ids = new Set<string>()
  outgoing.data?.forEach((r) => ids.add(r.blocked_id))
  incoming.data?.forEach((r) => ids.add(r.blocker_id))
  return Array.from(ids)
}
