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

  const { data } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id)

  return data?.map((r) => r.blocked_id) ?? []
}
