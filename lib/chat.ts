import { supabase } from './supabase'
import { screenText } from './textModeration'
import { isSessionGhosted } from './sessions'

export interface ChatMessage {
  id: string
  zone_id: string
  user_id: string
  session_id: string | null
  content: string
  created_at: string
  expires_at: string
  is_venue_msg?: boolean
  profiles: {
    id: string
    display_name: string
    avatar_url: string | null
  } | null
}

export async function fetchChat(zoneId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('venue_chat')
    .select('*, profiles(id, display_name, avatar_url)')
    .eq('zone_id', zoneId)
    .eq('is_hidden', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[chat] fetchChat error:', error.message)
    return []
  }

  return (data as ChatMessage[]) ?? []
}

export async function sendChatMessage(params: {
  zoneId: string
  content: string
  sessionId?: string | null
}): Promise<ChatMessage | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Content filter: never let profanity/hate land (enforced regardless of caller).
  if (!screenText(params.content).ok) {
    console.warn('[chat] message blocked by content filter')
    return null
  }

  // Ghost Mode (session mood 'not_today') means you're invisible in the venue.
  // Chatting would out your presence, so it's blocked. The composer is hidden in
  // the UI; this is the enforcement backstop for any caller.
  if (params.sessionId && await isSessionGhosted(params.sessionId)) {
    console.warn('[chat] message blocked — user in Ghost Mode')
    return null
  }

  const { data, error } = await supabase
    .from('venue_chat')
    .insert({
      zone_id: params.zoneId,
      user_id: user.id,
      content: params.content.trim(),
      session_id: params.sessionId ?? null,
    })
    .select('*, profiles(id, display_name, avatar_url)')
    .single()

  if (error) {
    console.error('[chat] sendChatMessage error:', error.message)
    return null
  }

  return data as ChatMessage
}

// Venue owner posting to their own room's chat (warnings, replies). Marked as a
// venue message so it renders distinctly. Requires the owner-insert policy
// (supabase/jacob_venue_chat_post.sql). Content still runs the text filter.
export async function sendVenueChatMessage(params: {
  zoneId: string
  content: string
}): Promise<ChatMessage | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  if (!screenText(params.content).ok) {
    console.warn('[chat] venue message blocked by content filter')
    return null
  }

  const { data, error } = await supabase
    .from('venue_chat')
    .insert({
      zone_id: params.zoneId,
      user_id: user.id,
      content: params.content.trim(),
      session_id: null,
      is_venue_msg: true,
    })
    .select('*, profiles(id, display_name, avatar_url)')
    .single()

  if (error) {
    console.error('[chat] sendVenueChatMessage error:', error.message)
    return null
  }

  return data as ChatMessage
}
