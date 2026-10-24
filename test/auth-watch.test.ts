import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import { watchAuth } from '../lib/authWatch.ts'

// The launch screen froze for Jacob on release day (Oct 14 2026) and then for
// Jamie. The app opened with a saved session whose access token had expired,
// supabase-js refreshed it during startup, and the ban check awaited a query
// inside the auth listener, which supabase-js waits on before startup can
// finish. No error, no timeout: the spinner just never stopped.
//
// These run the real supabase-js against a mocked network (nothing leaves the
// machine), with a ban check that awaits a real query the way hooks/useAuth.ts
// does, so that wait cannot come back unnoticed.

const URL_ = 'https://test.supabase.co'
const STORAGE_KEY = 'sb-test-auth-token'
const now = () => Math.floor(Date.now() / 1000)

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const fakeJwt = (exp: number) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'user-1', exp, role: 'authenticated' })}.sig`
const user = { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' }
const sessionExpiringAt = (exp: number) => ({ access_token: fakeJwt(exp), refresh_token: `refresh-${exp}`, token_type: 'bearer', expires_in: exp - now(), expires_at: exp, user })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Phone {
  saved: 'expired' | 'valid' | 'none'
  banned?: boolean
}

function launch({ saved, banned = false }: Phone) {
  const store = new Map<string, string>()
  if (saved === 'expired') store.set(STORAGE_KEY, JSON.stringify(sessionExpiringAt(now() - 3600)))
  if (saved === 'valid') store.set(STORAGE_KEY, JSON.stringify(sessionExpiringAt(now() + 3000)))

  const calls = { refresh: 0, profile: 0, refreshedToken: '' }
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
      calls.refresh++
      await wait(50) // a phone on a slow connection
      const next = sessionExpiringAt(now() + 3600)
      calls.refreshedToken = next.access_token
      return json(next)
    }
    if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 })
    if (url.includes('/rest/v1/profiles')) {
      calls.profile++
      await wait(20)
      return json([{ is_banned: banned }])
    }
    return json({}, 404)
  }

  const client = createClient(URL_, 'sb_publishable_test', {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => { store.set(key, value) },
        removeItem: async (key: string) => { store.delete(key) },
      },
    },
    global: { fetch },
  })

  // The same shape as ejectIfBanned in hooks/useAuth.ts: it awaits a query.
  const isBanned = async (session: Session | null) => {
    if (!session?.user?.id) return false
    const { data } = await client.from('profiles').select('is_banned').eq('id', session.user.id).maybeSingle()
    return !!data?.is_banned
  }

  return { client, calls, isBanned }
}

// What the launch screen sees: the first session watchAuth reports, or 'stuck'.
function firstSession(client: ReturnType<typeof launch>['client'], isBanned: (s: Session | null) => Promise<boolean>, extra: { banCheckTimeoutMs?: number } = {}) {
  return new Promise<{ session: Session | null } | 'stuck'>((resolve) => {
    let stop = () => {}
    const timer = setTimeout(() => { stop(); resolve('stuck') }, 3000)
    stop = watchAuth(client, {
      isBanned,
      ...extra,
      onSession: (session) => { clearTimeout(timer); stop(); resolve({ session }) },
    })
  })
}

test('a launch with an expired saved session finishes with the refreshed session (Jacob, Jamie)', async () => {
  const { client, calls, isBanned } = launch({ saved: 'expired' })
  const result = await firstSession(client, isBanned)
  client.auth.stopAutoRefresh()

  assert.notEqual(result, 'stuck', 'the launch screen never finished')
  if (result === 'stuck') return
  assert.equal(calls.refresh, 1)
  assert.equal(result.session?.access_token, calls.refreshedToken)
  assert.ok(calls.profile >= 1, 'the ban check still ran')
})

test('a launch with a saved session that is still valid finishes with it', async () => {
  const { client, calls, isBanned } = launch({ saved: 'valid' })
  const result = await firstSession(client, isBanned)
  client.auth.stopAutoRefresh()

  assert.notEqual(result, 'stuck')
  if (result === 'stuck') return
  assert.equal(calls.refresh, 0)
  assert.equal(result.session?.user.id, 'user-1')
})

test('a launch with nothing saved finishes signed out', async () => {
  const { client, isBanned } = launch({ saved: 'none' })
  const result = await firstSession(client, isBanned)
  client.auth.stopAutoRefresh()

  assert.deepEqual(result, { session: null })
})

test('a banned account finishes signed out', async () => {
  const { client, isBanned } = launch({ saved: 'expired', banned: true })
  const result = await firstSession(client, isBanned)
  client.auth.stopAutoRefresh()

  assert.deepEqual(result, { session: null })
})

test('a ban check that never answers does not hold the launch screen', async () => {
  const { client } = launch({ saved: 'valid' })
  const started = Date.now()
  const result = await firstSession(client, () => new Promise<boolean>(() => {}), { banCheckTimeoutMs: 200 })
  client.auth.stopAutoRefresh()

  assert.notEqual(result, 'stuck')
  if (result === 'stuck') return
  assert.equal(result.session?.user.id, 'user-1', 'goes in rather than out when the check cannot answer')
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started}ms`)
})

test('a sign-out is not undone by a slow check for an earlier event', async () => {
  const { client } = launch({ saved: 'valid' })
  const seen: (Session | null)[] = []
  const slowCheck = async (session: Session | null) => { if (session) await wait(300); return false }
  const stop = watchAuth(client, { isBanned: slowCheck, onSession: (session) => seen.push(session) })

  await wait(50)
  await client.auth.signOut()
  await wait(600)
  stop()
  client.auth.stopAutoRefresh()

  assert.equal(seen.at(-1), null, `the app ended on ${seen.at(-1)?.user?.id ?? 'null'}`)
})

// The rule, everywhere: an auth listener never awaits. A listener that awaits a
// Supabase call deadlocks startup the same way, wherever it lives.
test('no auth listener in the app is an async function', () => {
  const root = join(import.meta.dirname, '..')
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(name) && /onAuthStateChange\(\s*async\b/.test(readFileSync(path, 'utf-8'))) {
        offenders.push(path.slice(root.length + 1))
      }
    }
  }
  for (const dir of ['app', 'components', 'contexts', 'hooks', 'lib']) walk(join(root, dir))
  assert.deepEqual(offenders, [], 'move the awaited work into a setTimeout (see lib/authWatch.ts)')
})
