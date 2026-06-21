import { supabase } from './supabase'

export type ReportReason = 'harassment' | 'inappropriate_behavior' | 'spam' | 'fake_account' | 'other'

export async function reportUser(params: {
  reportedId: string
  zoneId: string
  reason: ReportReason
  note?: string
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('safety_reports').insert({
    reporter_id: user.id,
    reported_id: params.reportedId,
    zone_id: params.zoneId,
    reason: params.reason,
    note: params.note ?? null,
  })
}
