import { supabase } from './supabase'

export interface BlockedUser {
  blocked_id: string
  label: string | null
  created_at: string
}

// `label` is what Settings > Blocked users shows later. Pass whatever the blocker
// could already see ("Jordan P.", "Guest 3 in The Lantern Room"). Never pass a
// name the blocker could not see, or blocking would unmask an anonymous person.
export async function blockUser(
  blockedId: string,
  opts?: { label?: string; source?: string },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if (blockedId === user.id) return

  // Upsert: blocking someone twice (two screens, a double tap) is not an error.
  let { error } = await supabase.from('user_blocks').upsert(
    {
      blocker_id: user.id,
      blocked_id: blockedId,
      label:  opts?.label  ?? null,
      source: opts?.source ?? null,
    },
    { onConflict: 'blocker_id,blocked_id' },
  )

  // label/source come from apple_1_2_block_enforcement_and_ugc_controls.sql. If
  // that has not been run yet the columns do not exist (PostgREST says so with
  // PGRST204 / 42703); block without them rather than failing the whole action.
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    ;({ error } = await supabase.from('user_blocks').upsert(
      { blocker_id: user.id, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id' },
    ))
  }

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

// The people I have blocked. Blocking is mutual in effect (neither side sees the
// other), but that half is enforced in the database by is_blocked_between(): RLS
// only lets you read your own block rows, so the client cannot see who blocked
// it and never needs to. This list is a convenience filter on top of that.
export async function fetchBlockedIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id)

  if (error) {
    console.error('[blocks] fetchBlockedIds error:', error.message)
    return []
  }
  return (data ?? []).map((r) => r.blocked_id)
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, label, created_at')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false })

  if (!error) return (data ?? []) as BlockedUser[]

  // Same missing-column fallback as blockUser: list them without labels.
  if (error.code === '42703' || error.code === 'PGRST204') {
    const retry = await supabase
      .from('user_blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false })
    if (!retry.error) {
      return (retry.data ?? []).map((r) => ({ ...r, label: null })) as BlockedUser[]
    }
  }

  console.error('[blocks] fetchBlockedUsers error:', error.message)
  return []
}
