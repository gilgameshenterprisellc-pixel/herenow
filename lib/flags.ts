// Beta feature flags. One switch, read everywhere, so nothing about a hidden
// feature leaks into the UI while it's off.

// Pricing is hidden for the beta (Jacob: "no reason for anyone to see that
// yet"). When we turn it on, it should also become account-scoped — a person
// sees only consumer plans, a venue sees only venue plans (see app/pricing.tsx).
// Flip via EXPO_PUBLIC_SHOW_PRICING=true, or change the default here.
//
// Nothing in the shipped app reads this any more. The pricing screen, the
// billing return page and lib/checkout now live in unreleased/, outside the
// router, because App Review asked about paid content in a build where all of
// it was already flag-gated but still compiled in. The flag stays for when
// that code comes back -- read the note at the top of unreleased/pricing.tsx
// first, because iOS cannot use the Stripe path at all.
export const SHOW_PRICING = process.env.EXPO_PUBLIC_SHOW_PRICING === 'true'

// Beta-testing tooling: the post-check-in feedback prompt and the anonymous
// survey. Off by default because App Review rejected 1.0 (37) under Guideline
// 2.2 -- "features intended to support beta testing are not appropriate" in a
// production submission. Keep it off for anything going to the App Store; turn
// it on for internal builds when we want the feedback back.
export const SHOW_BETA_TOOLS = process.env.EXPO_PUBLIC_SHOW_BETA_TOOLS === 'true'
