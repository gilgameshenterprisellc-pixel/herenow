// Server-side photo screening for Apple Guideline 1.2 ("a method for filtering
// objectionable material from being posted"). The Sightengine credentials live
// here as function secrets and never ship inside the app bundle.
//
// Deploy:
//   supabase functions deploy moderate-image
//   supabase secrets set SIGHTENGINE_USER=... SIGHTENGINE_SECRET=...
//
// Callers (lib/moderation.ts) send { url } for a photo that was just uploaded to
// a public bucket. JWT verification is left on, so only signed-in users can call
// it. Without the secrets the function answers { ok: true, configured: false }
// and the app falls back to report -> auto-hide, exactly as before.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Only screen images that live in this project's own storage, so the function
// cannot be used as an open proxy to Sightengine.
const ALLOWED_PREFIX = `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { url } = await req.json()
    if (typeof url !== 'string' || !url.startsWith(ALLOWED_PREFIX)) return json({ ok: false, reason: 'bad_url' }, 400)

    const user = Deno.env.get('SIGHTENGINE_USER')
    const secret = Deno.env.get('SIGHTENGINE_SECRET')
    if (!user || !secret) return json({ ok: true, configured: false })

    const params = new URLSearchParams({
      url,
      models: 'nudity-2.1,offensive,gore-2.0',
      api_user: user,
      api_secret: secret,
    })
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`)
    const r = await res.json()
    if (r.status !== 'success') return json({ ok: true, configured: true, error: 'upstream' })

    const n = r.nudity ?? {}
    const sexual = Math.max(n.sexual_activity ?? 0, n.sexual_display ?? 0, n.erotica ?? 0)
    const offensive = Math.max(r.offensive?.prob ?? 0, r.offensive?.nazi ?? 0, r.offensive?.terrorist ?? 0)
    const gore = r.gore?.prob ?? 0

    if (sexual > 0.6) return json({ ok: false, configured: true, reason: 'explicit' })
    if (gore > 0.6) return json({ ok: false, configured: true, reason: 'graphic' })
    if (offensive > 0.6) return json({ ok: false, configured: true, reason: 'offensive' })
    return json({ ok: true, configured: true })
  } catch {
    return json({ ok: true, error: 'exception' })
  }
})
