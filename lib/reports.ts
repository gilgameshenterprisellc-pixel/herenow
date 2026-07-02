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

  const { error } = await supabase.from('safety_reports').insert({
    reporter_id: user.id,
    reported_id: params.reportedId,
    zone_id: params.zoneId,
    reason: params.reason,
    note: params.note ?? null,
  })

  if (error) {
    console.error('[reports] reportUser error:', error.message)
    throw new Error(error.message)
  }
}

export type ContentReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other'

export async function reportContent(params: {
  contentType: 'pulse_post' | 'chat_message'
  contentId: string
  zoneId: string
  reason: ContentReportReason
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('content_reports').insert({
    reporter_id:  user.id,
    zone_id:      params.zoneId,
    content_type: params.contentType,
    content_id:   params.contentId,
    reason:       params.reason,
  })

  if (error) {
    console.error('[reports] reportContent error:', error.message)
    throw new Error(error.message)
  }
}
