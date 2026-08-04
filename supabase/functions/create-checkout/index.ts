// Supabase Edge Function: create-checkout
// ----------------------------------------
// Creates a Stripe Checkout Session for a HereNow plan and returns its URL.
//
// Called from the WEB pricing page only. Apple requires in-app digital
// subscriptions to use Apple In-App Purchase, so the iOS app never launches an
// external checkout for consumer plans — lib/checkout.ts hard-guards Platform.OS.
//
// Auth: the caller's Supabase JWT (sent by supabase.functions.invoke) identifies
// the buyer. Deploy WITH jwt verification (the default) so only signed-in users
// can reach it.
//
//   supabase functions deploy create-checkout
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   (optional live overrides: PRICE_VENUE_PROFESSIONAL=..., etc.)

import Stripe from 'npm:stripe@16.12.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

// plan_id (+ interval for the consumer plan) -> Stripe price id. Sandbox/test IDs
// by default (match lib/pricing.ts); set the PRICE_* function secrets to override
// for live mode. Keep this switch in sync with lib/pricing.ts.
function priceFor(planId: string, interval: string): string | null {
  const env = (k: string, fallback: string) => Deno.env.get(k) ?? fallback
  switch (planId) {
    case 'venue_professional': return env('PRICE_VENUE_PROFESSIONAL', 'price_1U0oNeC684risSmJZlNy0N6G')
    case 'venue_growth':       return env('PRICE_VENUE_GROWTH',       'price_1U0oNeC684risSmJDg4jRdTu')
    case 'org_plus':           return env('PRICE_ORG_PLUS',           'price_1U0oNfC684risSmJrJtWZ3lo')
    case 'org_pro':            return env('PRICE_ORG_PRO',            'price_1U0oNfC684risSmJCix3uGXk')
    case 'plus':
      return interval === 'year'
        ? env('PRICE_PLUS_YEAR',  'price_1U0oNgC684risSmJ5aJ8ahBz')
        : env('PRICE_PLUS_MONTH', 'price_1U0oNgC684risSmJbwQA4k1L')
    default: return null
  }
}

const AUDIENCE: Record<string, string> = {
  venue_professional: 'venue',
  venue_growth:       'venue',
  org_plus:           'organization',
  org_pro:            'organization',
  plus:               'consumer',
}

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const {
      plan_id,
      interval = 'month',
      target_type = null,
      target_id = null,
      success_url,
      cancel_url,
    } = await req.json()

    const price = priceFor(plan_id, interval)
    if (!price) return json({ error: `Unknown plan: ${plan_id}` }, 400)

    // Reuse one Stripe customer per user across purchases.
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle()

    let customerId = existing?.stripe_customer_id as string | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
    }

    const audience = AUDIENCE[plan_id] ?? 'consumer'
    const meta = {
      user_id: user.id,
      plan_id,
      audience,
      target_type: target_type ?? '',
      target_id: target_id ?? '',
    }
    const origin = req.headers.get('origin') ?? 'https://herenowsocial.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: success_url ?? `${origin}/billing?status=success`,
      cancel_url:  cancel_url  ?? `${origin}/pricing?status=cancelled`,
      allow_promotion_codes: true,
      metadata: meta,
      subscription_data: { metadata: meta },
    })

    return json({ url: session.url })
  } catch (e) {
    console.error('[create-checkout]', e)
    return json({ error: (e as Error).message }, 500)
  }
})
