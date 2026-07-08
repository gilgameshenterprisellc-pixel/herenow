// Image moderation for photo-first Pulse — free by default.
//
// Default (no config): photos post instantly and rely on report → auto-hide
// (reportContent hides flagged content immediately for everyone). Zero cost.
//
// Optional proactive screening: set EXPO_PUBLIC_SIGHTENGINE_USER +
// EXPO_PUBLIC_SIGHTENGINE_SECRET (Sightengine has a free tier that covers beta
// volume). When present, uploads are screened and obvious NSFW is blocked before
// it ever posts. Note: in the current no-server setup the secret ships in the
// client bundle — fine for a rate-limited free-tier key during beta; move to a
// Supabase Edge Function before scale.

const SE_USER   = process.env.EXPO_PUBLIC_SIGHTENGINE_USER
const SE_SECRET = process.env.EXPO_PUBLIC_SIGHTENGINE_SECRET

export interface ScreenResult {
  ok: boolean          // true = safe to post
  reason?: string      // set when blocked
}

// Screens a public image URL. Returns { ok: true } when no key is configured
// (free/reactive mode) so posting is never blocked by moderation being off.
export async function screenImage(publicUrl: string): Promise<ScreenResult> {
  if (!SE_USER || !SE_SECRET) return { ok: true }

  try {
    const params = new URLSearchParams({
      url:        publicUrl,
      models:     'nudity-2.1,offensive',
      api_user:   SE_USER,
      api_secret: SE_SECRET,
    })
    const res  = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`)
    const json = await res.json()

    if (json.status !== 'success') return { ok: true } // fail open — don't block on API errors

    const nudity    = json.nudity ?? {}
    const sexual    = Math.max(nudity.sexual_activity ?? 0, nudity.sexual_display ?? 0, nudity.erotica ?? 0)
    const offensive = Math.max(
      json.offensive?.prob ?? 0,
      json.offensive?.nazi ?? 0,
      json.offensive?.terrorist ?? 0,
    )

    if (sexual > 0.6)    return { ok: false, reason: 'That photo looks explicit — try another.' }
    if (offensive > 0.6) return { ok: false, reason: 'That photo may be offensive — try another.' }
    return { ok: true }
  } catch {
    return { ok: true } // network error — fail open, report/hide still covers abuse
  }
}
