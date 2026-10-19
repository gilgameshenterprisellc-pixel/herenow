import { supabase } from './supabase'
import { logEvent } from './analytics'
import { sendNotification } from './notifications'
import {
  contestErrorMessage,
  type ContestStatus,
  type EntryStatus,
} from './contestFormat'

// Live contests: sign-up, a live leaderboard, and an operator running it in
// real time (a mechanical bull night, darts, trivia). The database does the
// work; see supabase/live_contests.sql. Every call here returns
// { ok, error } with the error already in words a person can act on.

export interface Contest {
  id: string
  zone_id: string
  org_id: string | null
  created_by: string | null
  title: string
  tagline: string | null
  presented_by: string | null
  logo_url: string | null
  banner_url: string | null
  accent_color: string
  rules: string | null
  prizes: string | null
  starts_at: string | null
  score_label: string
  score_suffix: string
  score_decimals: number
  higher_wins: boolean
  attempts_per_entry: number
  max_entries: number | null
  status: ContestStatus
  signups_open: boolean
  venue_approved: boolean
  now_up_entry_id: string | null
  ticker: string | null
  entry_count: number
  ended_at: string | null
  version: number
  created_at: string
  updated_at: string
  // Only on the board payload:
  zone_name?: string | null
  org_name?: string | null
  zone_owner_is_me?: boolean
}

export interface BoardRow {
  entry_id: string
  name: string | null        // null when one of you blocked the other
  best_score: number | null
  attempts_used: number
  status: EntryStatus
  is_me: boolean
  rank: number
}

export interface LineRow {
  entry_id: string
  name: string | null
  status: 'up' | 'waiting'
  attempts_used: number
  is_me: boolean
  position: number           // 0 for whoever is up, then 1, 2, 3...
}

export interface MyEntry {
  entry_id: string
  status: EntryStatus
  attempts_used: number
  best_score: number | null
  position: number | null    // place among people waiting
  rank: number | null
}

export interface ContestAttempt {
  id: string
  entry_id: string
  score: number
  voided: boolean
  created_at: string
}

export interface ContestOperator {
  user_id: string
  display_name: string | null
  username: string | null
}

export interface ContestBoard {
  contest: Contest
  role: 'manager' | 'operator' | null
  checked_in: boolean
  can_view: boolean
  me: MyEntry | null
  now_up: { entry_id: string; name: string | null; attempts_used: number; is_me: boolean } | null
  leaderboard: BoardRow[]
  line: LineRow[]
  ops: {
    skipped: { entry_id: string; name: string; status: 'no_show' | 'removed'; attempts_used: number }[]
    attempts: ContestAttempt[]
    operators: ContestOperator[] | null
  } | null
  server_now: string
}

export interface Result<T = unknown> {
  ok: boolean
  error?: string
  data?: T
}

function fail<T>(raw: string | undefined, where: string): Result<T> {
  if (raw) console.warn(`[contests] ${where}:`, raw)
  return { ok: false, error: contestErrorMessage(raw) }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return fail<T>(error.message, fn)
    return { ok: true, data: data as T }
  } catch (e: any) {
    return fail<T>(String(e?.message ?? e), fn)
  }
}

// Numbers come back from Postgres numeric as strings; the screens want numbers.
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeBoard(raw: any): ContestBoard | null {
  if (!raw || !raw.contest) return null
  return {
    ...raw,
    me: raw.me ? { ...raw.me, best_score: num(raw.me.best_score) } : null,
    leaderboard: (raw.leaderboard ?? []).map((r: any) => ({ ...r, best_score: num(r.best_score) })),
    line: raw.line ?? [],
    ops: raw.ops
      ? {
          ...raw.ops,
          attempts: (raw.ops.attempts ?? []).map((a: any) => ({ ...a, score: num(a.score) ?? 0 })),
          skipped: raw.ops.skipped ?? [],
        }
      : null,
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Everything one screen needs. null data means the contest is gone or hidden. */
export async function fetchContestBoard(contestId: string): Promise<Result<ContestBoard | null>> {
  const res = await call<any>('contest_board', { p_contest: contestId })
  if (!res.ok) return res
  return { ok: true, data: normalizeBoard(res.data) }
}

/**
 * Contests at a venue for the venue page card. The database decides what you
 * may see: running ones for everyone, plus drafts and hidden ones for the
 * people who run them. Old finished contests are trimmed here.
 */
export async function fetchVenueContests(zoneId: string): Promise<Contest[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('contests')
    .select('*')
    .eq('zone_id', zoneId)
    .or(`status.neq.ended,ended_at.gt."${since}"`)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) {
    console.warn('[contests] fetchVenueContests:', error.message)
    return []
  }
  return (data ?? []) as Contest[]
}

/** Every contest a venue or an org has made, for the host's list. */
export async function fetchHostContests(params: { zoneId?: string; orgId?: string }): Promise<Contest[]> {
  let q = supabase.from('contests').select('*').order('created_at', { ascending: false }).limit(50)
  if (params.orgId) q = q.eq('org_id', params.orgId)
  else if (params.zoneId) q = q.eq('zone_id', params.zoneId)
  else return []
  const { data, error } = await q
  if (error) {
    console.warn('[contests] fetchHostContests:', error.message)
    return []
  }
  return (data ?? []) as Contest[]
}

// ── Hosts ────────────────────────────────────────────────────────────────────

export type ContestFields = Partial<Pick<Contest,
  'title' | 'tagline' | 'presented_by' | 'logo_url' | 'banner_url' | 'accent_color' |
  'rules' | 'prizes' | 'starts_at' | 'score_label' | 'score_suffix' | 'score_decimals' |
  'higher_wins' | 'attempts_per_entry' | 'max_entries'>> & { status?: 'draft' | 'scheduled' }

/** Create (contestId null) or edit. Returns the contest id. */
export async function saveContest(
  contestId: string | null,
  where: { zoneId?: string | null; orgId?: string | null },
  fields: ContestFields,
): Promise<Result<string>> {
  const res = await call<string>('contest_save', {
    p_contest: contestId,
    p_zone: where.zoneId ?? null,
    p_org: where.orgId ?? null,
    p: fields,
  })
  if (res.ok && !contestId) logEvent('contest_created', { zoneId: where.zoneId ?? undefined, contestId: res.data })
  return res
}

export const approveContest = (contestId: string, approved: boolean) =>
  call('contest_approve', { p_contest: contestId, p_approved: approved })

export const addOperator = (contestId: string, username: string) =>
  call<ContestOperator>('contest_add_operator', { p_contest: contestId, p_username: username })

export const removeOperator = (contestId: string, userId: string) =>
  call('contest_remove_operator', { p_contest: contestId, p_user: userId })

export const deleteContest = (contestId: string) =>
  call('contest_delete', { p_contest: contestId })

// ── Operators ────────────────────────────────────────────────────────────────

export const setContestStatus = (contestId: string, status: ContestStatus) =>
  call('contest_set_status', { p_contest: contestId, p_status: status })

export const setSignupsOpen = (contestId: string, open: boolean) =>
  call('contest_set_signups', { p_contest: contestId, p_open: open })

export const setTicker = (contestId: string, text: string) =>
  call('contest_set_ticker', { p_contest: contestId, p_text: text })

interface CallResult {
  called: { entry_id: string; user_id: string; display_name: string } | null
  on_deck?: { entry_id: string; user_id: string; display_name: string } | null
  title?: string
  zone_id?: string
}

/**
 * Call the next person up (or a specific one), then tell them, and give the
 * person after them a heads-up. The notifications are sent in the background
 * so the operator's screen never waits on them.
 */
export async function callUp(contestId: string, entryId?: string): Promise<Result<CallResult>> {
  const res = await call<CallResult>('contest_call', { p_contest: contestId, p_entry: entryId ?? null })
  if (!res.ok || !res.data?.called) return res
  const { called, on_deck, title, zone_id } = res.data
  const data = { contest_id: contestId, zone_id }
  logEvent('contest_called', { zoneId: zone_id, contestId })
  ;(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const jobs: Promise<void>[] = []
    if (called.user_id !== user?.id) {
      jobs.push(sendNotification({
        userId: called.user_id,
        type: 'contest_up',
        title: title ?? "You're up",
        body: "You're up! Head over now.",
        data: { type: 'contest_up', ...data },
      }))
    }
    if (on_deck && on_deck.user_id !== user?.id) {
      jobs.push(sendNotification({
        userId: on_deck.user_id,
        type: 'contest_on_deck',
        title: title ?? "You're on deck",
        body: "You're on deck. Get ready, you're next.",
        data: { type: 'contest_on_deck', ...data },
      }))
    }
    await Promise.allSettled(jobs)
  })().catch(() => {})
  return res
}

export async function recordScore(contestId: string, entryId: string, score: number): Promise<Result> {
  const res = await call('contest_record_score', { p_contest: contestId, p_entry: entryId, p_score: score })
  if (res.ok) logEvent('contest_scored', { contestId })
  return res
}

export const editAttempt = (attemptId: string, score: number) =>
  call('contest_edit_attempt', { p_attempt: attemptId, p_score: score })

export const voidAttempt = (attemptId: string) =>
  call('contest_void_attempt', { p_attempt: attemptId })

export const setEntryStatus = (entryId: string, status: 'waiting' | 'no_show' | 'removed') =>
  call('contest_set_entry_status', { p_entry: entryId, p_status: status })

// ── Entrants ─────────────────────────────────────────────────────────────────

export async function joinContest(contestId: string, zoneId?: string): Promise<Result> {
  const res = await call('contest_join', { p_contest: contestId })
  if (res.ok) logEvent('contest_joined', { zoneId, contestId })
  return res
}

export const leaveContest = (contestId: string) =>
  call('contest_withdraw', { p_contest: contestId })

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * Upload a logo or banner to the venue-media bucket and return its public URL.
 * Uses the board/<zone>/<user>/ path the bucket already accepts from any
 * signed-in user, since an org's rep isn't the venue owner.
 */
export async function uploadContestImage(
  zoneId: string,
  kind: 'logo' | 'banner',
  body: Blob | ArrayBuffer,
  contentType: string,
): Promise<Result<string>> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const path = `board/${zoneId}/${user.id}/contest-${kind}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('venue-media').upload(path, body as any, { contentType, upsert: true })
  if (error) return fail(error.message, 'uploadContestImage')
  const { data } = supabase.storage.from('venue-media').getPublicUrl(path)
  return { ok: true, data: data.publicUrl }
}
