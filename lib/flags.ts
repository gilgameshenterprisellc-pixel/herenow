// Beta feature flags. One switch, read everywhere, so nothing about a hidden
// feature leaks into the UI while it's off.

// Pricing is hidden for the beta (Jacob: "no reason for anyone to see that
// yet"). When we turn it on, it should also become account-scoped — a person
// sees only consumer plans, a venue sees only venue plans (see app/pricing.tsx).
// Flip via EXPO_PUBLIC_SHOW_PRICING=true, or change the default here.
export const SHOW_PRICING = process.env.EXPO_PUBLIC_SHOW_PRICING === 'true'

// Beta-testing tooling: the post-check-in feedback prompt and the anonymous
// survey. Off by default because App Review rejected 1.0 (37) under Guideline
// 2.2 -- "features intended to support beta testing are not appropriate" in a
// production submission. Keep it off for anything going to the App Store; turn
// it on for internal builds when we want the feedback back.
export const SHOW_BETA_TOOLS = process.env.EXPO_PUBLIC_SHOW_BETA_TOOLS === 'true'
