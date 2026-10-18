// Supabase Edge Function: app-store-analytics
// --------------------------------------------
// Pulls daily App Store downloads and product page views for HereNow (Apple ID
// 6787771014) from the App Store Connect Analytics Reports API into the
// app_store_daily table, for the Pilot Dashboard. Setup and secrets:
// supabase/functions/APP_STORE_SETUP.md. Table, schedule and dashboard RPC:
// supabase/app_store_daily.sql. All parsing and merge logic lives in
// ../_shared/app-store-analytics.ts, which has node tests.
//
// Deploy WITHOUT Supabase JWT verification. The caller is pg_cron, and the
// trust comes from the x-sync-secret header, checked below against a random
// secret that app_store_daily.sql created in Vault:
//
//   npx supabase functions deploy app-store-analytics --no-verify-jwt
//
// Each run writes one row to app_store_sync_runs, success or failure, so a
// broken sync shows on the dashboard instead of looking like a quiet week.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  ASC_API, AscError, makeAscToken, runSync,
  type DayRow, type AscKey,
} from '../_shared/app-store-analytics.ts'

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined

const APP_ID = '6787771014'

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? '' } catch { return '' }
}

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
  auth: { persistSession: false },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function ascKey(): AscKey | null {
  const issuerId = Deno.env.get('APP_STORE_CONNECT_ISSUER_ID') ?? ''
  const keyId = Deno.env.get('APP_STORE_CONNECT_KEY_ID') ?? ''
  const privateKey = Deno.env.get('APP_STORE_CONNECT_PRIVATE_KEY') ?? ''
  return issuerId && keyId && privateKey ? { issuerId, keyId, privateKey } : null
}

async function recordRun(ok: boolean, message: string, details: unknown) {
  const { error } = await db.from('app_store_sync_runs').insert({ ok, message, details })
  if (error) console.error('[app-store-analytics] could not record run:', error.message)
  // Keep three months of run history.
  const { error: pruneErr } = await db.from('app_store_sync_runs')
    .delete().lt('ran_at', new Date(Date.now() - 90 * 86400_000).toISOString())
  if (pruneErr) console.warn('[app-store-analytics] prune:', pruneErr.message)
}

async function sync(key: AscKey) {
  // One token per 10 minutes of run time; each lives 15 (Apple's cap is 20).
  let token = ''
  let tokenAt = 0
  const auth = async () => {
    if (!token || Date.now() - tokenAt > 10 * 60_000) {
      token = await makeAscToken(key)
      tokenAt = Date.now()
    }
    return `Bearer ${token}`
  }

  const call = async (method: 'GET' | 'POST', pathOrUrl: string, body?: unknown) => {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${ASC_API}${pathOrUrl}`
    const res = await fetch(url, {
      method,
      headers: { Authorization: await auth(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      let detail = text.slice(0, 300)
      try {
        const e = JSON.parse(text)?.errors?.[0]
        if (e) detail = `${e.code ?? ''} ${e.title ?? ''}: ${e.detail ?? ''}`.trim()
      } catch { /* not JSON */ }
      throw new AscError(res.status, `${method} ${url.replace(ASC_API, '')} -> ${res.status} ${detail}`)
    }
    return text ? JSON.parse(text) : {}
  }

  return await runSync({
    appId: APP_ID,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    // Presigned S3 URL: no Authorization header (it would be rejected).
    download: async (url) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`segment download -> ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    },
    ingestedInstanceIds: async () => {
      const { data, error } = await db.from('app_store_report_instances').select('instance_id')
      if (error) throw new Error(`read app_store_report_instances: ${error.message}`)
      return new Set((data ?? []).map((r: { instance_id: string }) => r.instance_id))
    },
    loadDays: async (days) => {
      const { data, error } = await db.from('app_store_daily').select('*').in('day', days)
      if (error) throw new Error(`read app_store_daily: ${error.message}`)
      return (data ?? []) as DayRow[]
    },
    saveDays: async (rows) => {
      const now = new Date().toISOString()
      const { error } = await db.from('app_store_daily')
        .upsert(rows.map((r) => ({ ...r, updated_at: now })), { onConflict: 'day' })
      if (error) throw new Error(`write app_store_daily: ${error.message}`)
    },
    markIngested: async (rec) => {
      const { error } = await db.from('app_store_report_instances').upsert(rec, { onConflict: 'instance_id' })
      if (error) throw new Error(`write app_store_report_instances: ${error.message}`)
    },
    log: (m) => console.log('[app-store-analytics]', m),
  })
}

async function runAndRecord(key: AscKey) {
  try {
    const r = await sync(key)
    const msg = r.instancesIngested > 0
      ? `Read ${r.instancesIngested} report file(s), updated ${r.daysWritten} day(s).`
      : (r.notes[0] ?? 'Up to date: no new report files from Apple.')
    await recordRun(true, msg, r)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[app-store-analytics] sync failed:', msg)
    await recordRun(false, msg, { status: e instanceof AscError ? e.status : null })
  }
}

Deno.serve(async (req) => {
  // Only the scheduled job (or app_store_sync_now() in the SQL editor) knows the
  // secret. It lives in Vault and never leaves the database.
  const secret = req.headers.get('x-sync-secret') ?? ''
  if (!secret) return json({ ok: false, reason: 'unauthorized' }, 401)
  const { data: allowed, error } = await db.rpc('app_store_sync_secret_ok', { p_secret: secret })
  if (error) {
    console.error('[app-store-analytics] secret check:', error.message)
    return json({ ok: false, reason: 'secret_check_failed' }, 500)
  }
  if (allowed !== true) return json({ ok: false, reason: 'unauthorized' }, 401)

  const key = ascKey()
  if (!key) {
    const msg = 'App Store Connect secrets are not set (APP_STORE_CONNECT_ISSUER_ID, _KEY_ID, _PRIVATE_KEY).'
    await recordRun(false, msg, null)
    return json({ ok: false, reason: 'not_configured' }, 200)
  }

  // pg_net gives up waiting after a few seconds, so answer at once and keep
  // working in the background. The result lands in app_store_sync_runs.
  const work = runAndRecord(key)
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work)
    return json({ ok: true, started: true }, 202)
  }
  await work
  return json({ ok: true, started: true })
})
