// Signup consent — what was agreed to, and which version of it.
//
// Jacob (Aug 26): "Users have to check a box upon first registering with the
// privacy agreement and terms of service agreeing they won't abuse the app or be
// creepy... store the user ID + timestamp + version number of the Terms/Privacy
// Policy/Community Guidelines they accepted. If we update them later, we can
// require users to accept the new version."
//
// The version is the point. An unversioned "accepted: true" flag tells you
// somebody agreed to something at some point, which is worth very little the
// first time the documents change or the first time a moderation decision is
// challenged. Recording which revision was on screen is what makes the record
// mean anything.

import { supabase } from './supabase'

export type ConsentDoc = 'terms' | 'privacy' | 'guidelines'

/**
 * Bump the version when a document's substance changes.
 *
 * Not a hash of the file and not the "Last updated" line: a typo fix should not
 * invalidate every consent on record, and only a person can judge whether an
 * edit is substantive. `effective` is carried for humans reading the audit trail.
 */
export const CONSENT_DOCS: Record<ConsentDoc, {
  version: number; effective: string; label: string; href: string
}> = {
  terms:      { version: 1, effective: '2026-07-28', label: 'Terms of Service',     href: '/legal/terms' },
  privacy:    { version: 1, effective: '2026-07-28', label: 'Privacy Policy',       href: '/legal/privacy' },
  guidelines: { version: 1, effective: '2026-07-28', label: 'Community Guidelines', href: '/legal/community' },
}

/**
 * Record agreement to every current document.
 *
 * Non-fatal by design. A signup that succeeded must not be rolled back because
 * an audit insert failed — that would strand an auth user with no profile, the
 * exact failure signup.tsx already guards against elsewhere. The error is logged
 * loudly instead, and outstandingConsents() will simply report the document as
 * unaccepted, so the user is re-prompted rather than silently recorded as having
 * agreed to something they were never asked about.
 */
export async function recordConsent(userId: string): Promise<void> {
  const rows = (Object.keys(CONSENT_DOCS) as ConsentDoc[]).map(doc => ({
    user_id:  userId,
    document: doc,
    version:  CONSENT_DOCS[doc].version,
  }))

  const { error } = await supabase
    .from('user_consents')
    .upsert(rows, { onConflict: 'user_id,document,version' })

  if (error) console.error('[consent] failed to record signup consent:', error.message)
}

/**
 * Which documents this user has not accepted at their current version.
 *
 * Empty array means fully up to date. Returns every document on a read failure
 * rather than an empty array: the safe direction is to ask again, never to
 * assume agreement we cannot prove.
 */
export async function outstandingConsents(userId: string): Promise<ConsentDoc[]> {
  const all = Object.keys(CONSENT_DOCS) as ConsentDoc[]

  const { data, error } = await supabase
    .from('user_consents')
    .select('document, version')
    .eq('user_id', userId)

  if (error) {
    console.warn('[consent] could not read consents, treating all as outstanding:', error.message)
    return all
  }

  const accepted = new Set((data ?? []).map(r => `${r.document}:${r.version}`))
  return all.filter(doc => !accepted.has(`${doc}:${CONSENT_DOCS[doc].version}`))
}
