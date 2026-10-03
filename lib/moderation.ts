// Image moderation. Photos are screened by the moderate-image Edge Function
// (supabase/functions/moderate-image), which holds the Sightengine credentials
// server-side. The app never carries a moderation secret in its bundle.
//
// Fails open on purpose: if the function is not deployed, has no credentials, or
// the network drops, posting still works and the report -> auto-hide path
// (reportContent hides flagged content immediately for everyone) covers abuse.

import { supabase } from './supabase'

export interface ScreenResult {
  ok: boolean          // true = safe to post
  reason?: string      // set when blocked
}

const REASONS: Record<string, string> = {
  explicit:  'That photo looks explicit. Try another.',
  graphic:   'That photo looks graphic or violent. Try another.',
  offensive: 'That photo may be offensive. Try another.',
}

// Screens a public image URL that was just uploaded to this project's storage.
export async function screenImage(publicUrl: string): Promise<ScreenResult> {
  try {
    const { data, error } = await supabase.functions.invoke('moderate-image', { body: { url: publicUrl } })
    if (error || !data) return { ok: true }
    if (data.ok === false && data.reason) {
      return { ok: false, reason: REASONS[data.reason] ?? 'That photo can\'t be posted.' }
    }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}
