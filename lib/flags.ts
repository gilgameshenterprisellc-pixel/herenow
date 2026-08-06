// Beta feature flags. One switch, read everywhere, so nothing about a hidden
// feature leaks into the UI while it's off.

// Pricing is hidden for the beta (Jacob: "no reason for anyone to see that
// yet"). When we turn it on, it should also become account-scoped — a person
// sees only consumer plans, a venue sees only venue plans (see app/pricing.tsx).
// Flip via EXPO_PUBLIC_SHOW_PRICING=true, or change the default here.
export const SHOW_PRICING = process.env.EXPO_PUBLIC_SHOW_PRICING === 'true'
