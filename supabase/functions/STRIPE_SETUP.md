# Stripe checkout — deploy & config

All the code is committed. These are the steps that need your Supabase and Stripe
logins (I can't run them for you). Everything below is against the **sandbox / test**
account first. When you go live, redo steps 2 and 5 with the live values.

## 1. Create the entitlement table
Supabase → SQL editor → run `supabase/stripe_subscriptions.sql`. Creates the
`subscriptions` table (+ RLS) and the `has_active_subscription` / `is_user_plus`
helper functions.

## 2. Set the function secrets
From the repo root (needs the Supabase CLI, `npm i -g supabase`, and `supabase link`
to the HereNow project once):

```
supabase secrets set STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY             \
                     STRIPE_WEBHOOK_SECRET=whsec_FILL_AFTER_STEP_5       \
                     SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically, no need to set them.

## 3. Deploy the two functions
```
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```
`--no-verify-jwt` on the webhook is required — Stripe doesn't send a Supabase JWT;
the webhook trusts the Stripe signature instead.

## 4. Note the webhook URL
It's `https://<your-project-ref>.functions.supabase.co/stripe-webhook`.

## 5. Add the webhook in Stripe
Stripe (sandbox) → Developers → Webhooks → Add endpoint. Paste the URL from step 4.
Subscribe to exactly these events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the endpoint's signing secret (`whsec_...`) and put it into
`STRIPE_WEBHOOK_SECRET` (rerun step 2), then redeploy the webhook (step 3).

## 6. Test end to end (web)
Run the web build, open `/pricing`, HereNow Plus tab → **Get HereNow Plus**. Use
Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC. After paying,
a row should appear in the `subscriptions` table with `status = active`, and
`select is_user_plus(auth.uid())` should return true for that user.

## Going live later
1. Rerun `scripts/seed-stripe-products.mjs` with your `sk_live_` key to create live
   products, and paste the live price IDs into `lib/pricing.ts` (or set the
   `PRICE_*` function secrets to the live IDs).
2. Rerun step 2 with the live `STRIPE_SECRET_KEY` and the live webhook secret.
3. Add the live webhook endpoint in the live Stripe dashboard (step 5).

## Note on iOS
Checkout is deliberately **web-only**. Apple requires in-app digital subscriptions
to use Apple In-App Purchase, so `lib/checkout.ts` hard-guards `Platform.OS` and the
iOS app never opens external checkout. Consumer HereNow Plus in the iOS app would
need an Apple IAP product (separate work); venue/org plans are B2B and are sold on
the web. This keeps the iOS binary App-Review-safe.
