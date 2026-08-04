// Seed the HereNow product catalog into Stripe (matches lib/pricing.ts).
//
// Idempotent: products are tagged with metadata.hn_plan and prices are matched
// on amount + interval, so re-running REUSES what already exists instead of
// creating duplicates. Safe to run more than once.
//
// It operates in whatever mode your key is for — a sk_test_ key hits the
// sandbox, a sk_live_ key hits live — and prints which. Run in TEST first so we
// can build and test checkout, then run again later with the live key.
//
// Run from the repo root (PowerShell):
//   $env:STRIPE_SECRET_KEY="sk_test_...paste your test secret key..."; node scripts/seed-stripe-products.mjs
//
// Needs Node 18+ (uses global fetch). Copy the JSON it prints at the end and
// send it to me — I paste the IDs into lib/pricing.ts.

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) {
  console.error('Set STRIPE_SECRET_KEY first, e.g.  $env:STRIPE_SECRET_KEY="sk_test_..."')
  process.exit(1)
}
const LIVE = KEY.startsWith('sk_live_')

async function stripe(path, method = 'GET', form) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message ?? res.status}`)
  return json
}

// plan code (matches lib/pricing.ts ids) -> product name + its recurring prices
const CATALOG = [
  { code: 'venue_professional', name: 'Venue Professional', prices: [{ key: 'monthlyPriceId', amount: 9900,  interval: 'month' }] },
  { code: 'venue_growth',       name: 'Venue Growth',       prices: [{ key: 'monthlyPriceId', amount: 24900, interval: 'month' }] },
  { code: 'org_plus',           name: 'Organization Plus',  prices: [{ key: 'monthlyPriceId', amount: 2900,  interval: 'month' }] },
  { code: 'org_pro',            name: 'Organization Pro',   prices: [{ key: 'monthlyPriceId', amount: 9900,  interval: 'month' }] },
  { code: 'plus',               name: 'HereNow Plus',       prices: [
    { key: 'monthlyPriceId', amount: 799,  interval: 'month' },
    { key: 'annualPriceId',  amount: 6900, interval: 'year'  },
  ] },
]

async function findProduct(code) {
  let startingAfter
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({ limit: '100', ...(startingAfter ? { starting_after: startingAfter } : {}) })
    const page = await stripe(`products?${qs}`)
    const hit = page.data.find((p) => p.metadata?.hn_plan === code)
    if (hit) return hit
    if (!page.has_more) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return null
}

async function findPrice(productId, amount, interval) {
  const page = await stripe(`prices?product=${productId}&limit=100`)
  return page.data.find(
    (p) => p.unit_amount === amount && p.recurring?.interval === interval && p.currency === 'usd' && p.active,
  ) ?? null
}

const out = {}
for (const item of CATALOG) {
  let product = await findProduct(item.code)
  if (!product) {
    product = await stripe('products', 'POST', { name: item.name, 'metadata[hn_plan]': item.code })
    console.log(`created product  ${item.name}  ->  ${product.id}`)
  } else {
    console.log(`reuse product    ${item.name}  ->  ${product.id}`)
  }
  out[item.code] = { productId: product.id }
  for (const pr of item.prices) {
    let price = await findPrice(product.id, pr.amount, pr.interval)
    if (!price) {
      price = await stripe('prices', 'POST', {
        product: product.id,
        currency: 'usd',
        unit_amount: String(pr.amount),
        'recurring[interval]': pr.interval,
      })
      console.log(`  created price  ${pr.interval}  $${(pr.amount / 100).toFixed(2)}  ->  ${price.id}`)
    } else {
      console.log(`  reuse price    ${pr.interval}  $${(pr.amount / 100).toFixed(2)}  ->  ${price.id}`)
    }
    out[item.code][pr.key] = price.id
  }
}

console.log(`\n=== MODE: ${LIVE ? 'LIVE' : 'TEST'} ===`)
console.log('Send me this block — I paste the IDs into lib/pricing.ts:\n')
console.log(JSON.stringify(out, null, 2))
