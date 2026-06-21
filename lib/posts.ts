import { supabase } from './supabase'

export async function toggleLike(postId: string): Promise<{ liked: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { liked: false }

  const { data: existing } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    await supabase.from('post_likes').delete().eq('id', existing.id)
    return { liked: false }
  } else {
    await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id })
    return { liked: true }
  }
}

export async function fetchLikedPostIds(postIds: string[]): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || postIds.length === 0) return new Set()

  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds)

  return new Set(data?.map((r) => r.post_id) ?? [])
}
