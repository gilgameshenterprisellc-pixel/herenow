// Supabase Edge Function: stripe-webhook
// ---------------------------------------
// Grants / updates a HereNow subscription when Stripe reports payment events.
// Writes with the service-role key (bypasses RLS) — server context only. The
// app never grants entitlement; only a Stripe-signature-verified event does.
//
// Deploy WITHOUT jwt verification (Stripe does not send a Supabase JWT — the
// trust comes from the Stripe signature check below):
//
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_... \
//                        STRIPE_WEBHOOK_SECRET=whsec_... \
//                        SUPABASE_SERVICE_ROLE_KEY=...
//
// Then in Stripe → Developers → Webhooks, add an endpoint pointing at this
// function's URL, subscribed to: checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted. Copy the signing
// secret (whsec_...) into STRIPE_WEBHOOK_SECRET above.

import Stripe from 'npm:stripe@16.12.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const iso = (unixSeconds: number | null | undefined) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature') ?? ''
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (e) {
    console.error('[stripe-webhook] bad signature', e)
    return new Response('bad signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        const subId = (s.subscription as string | null) ?? null
        const m = s.metadata ?? {}

        let status = 'active'
        let periodEnd: string | null = null
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          status = sub.status
          periodEnd = iso(sub.current_period_end)
        }

        await admin.from('subscriptions').upsert(
          {
            user_id:                m.user_id,
            plan_id:                m.plan_id,
            audience:               m.audience || 'consumer',
            target_type:            m.target_type || null,
            target_id:              m.target_id || null,
            stripe_customer_id:     s.customer as string,
            stripe_subscription_id: subId,
            status,
            current_period_end:     periodEnd,
            updated_at:             new Date().toISOString(),
          },
          { onConflict: 'stripe_subscription_id' },
        )
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await admin
          .from('subscriptions')
          .update({
            status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
            current_period_end: iso(sub.current_period_end),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error', e)
    return new Response('handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
