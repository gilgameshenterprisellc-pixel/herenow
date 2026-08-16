import { supabase } from './supabase'

// post_likes is keyed by the composite (post_id, user_id) and has NO id column.
// This used to select and delete by 'id': the select returned a 400, the error
// was dropped on the floor, `existing` came back null, so every tap took the
// insert branch. The first like worked, and unliking was impossible — the second
// tap just re-inserted onto the primary key and failed silently. Match on the
// real key instead.
export async function toggleLike(postId: string): Promise<{ liked: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { liked: false }

  const { data: existing, error: readErr } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (readErr) {
    console.warn('[posts] toggleLike read error:', readErr.message)
    return { liked: false }
  }

  if (existing) {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id)
    if (error) {
      console.warn('[posts] unlike error:', error.message)
      return { liked: true }   // still liked — the row is still there
    }
    return { liked: false }
  }

  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: postId, user_id: user.id })
  if (error) {
    console.warn('[posts] like error:', error.message)
    return { liked: false }
  }
  return { liked: true }
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
