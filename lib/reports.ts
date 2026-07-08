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

  // Report + auto-hide the reported user from People tabs for 24h pending review.
  // (.rpc returns errors, it doesn't throw — fall back to a plain report insert
  // without the hide if supabase/jacob_report_autohide.sql hasn't been run yet)
  const { error: rpcError } = await supabase.rpc('report_user_auto_hide', {
    p_reported_id: params.reportedId,
    p_zone_id:     params.zoneId,
    p_reason:      params.reason,
    p_note:        params.note ?? null,
  })
  if (!rpcError) return

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

  // Report + immediately hide the content pending review (err on caution for
  // photos). RPC returns errors rather than throwing — fall back to a plain
  // report insert if report_content_auto_hide SQL hasn't been run.
  const { error: rpcError } = await supabase.rpc('report_content_auto_hide', {
    p_content_type: params.contentType,
    p_content_id:   params.contentId,
    p_zone_id:      params.zoneId,
    p_reason:       params.reason,
  })
  if (!rpcError) return

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
