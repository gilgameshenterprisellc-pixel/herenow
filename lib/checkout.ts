import { Platform } from 'react-native'
import { supabase } from './supabase'

export type BillingInterval = 'month' | 'year'

// Starts a Stripe Checkout for a plan and redirects the browser to it.
//
// WEB ONLY, on purpose. Apple requires in-app digital subscriptions to use Apple
// In-App Purchase, so we must never launch an external Stripe checkout from
// inside the iOS app — doing so is an App Store rejection. On native this returns
// a message and does nothing. Venue/org B2B plans are onboarded manually during
// the pilot and don't call this at all.
//
// Returns null on success (the page is navigating away), or an error string.
export async function startCheckout(
  planId: string,
  interval: BillingInterval = 'month',
  opts?: { targetType?: string; targetId?: string },
): Promise<string | null> {
  if (Platform.OS !== 'web') {
    return 'Checkout runs on the web for now.'
  }

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: {
      plan_id: planId,
      interval,
      target_type: opts?.targetType ?? null,
      target_id: opts?.targetId ?? null,
    },
  })

  if (error) return error.message
  const url = (data as { url?: string } | null)?.url
  if (!url) return 'Could not start checkout. Try again.'

  window.location.href = url
  return null
}
