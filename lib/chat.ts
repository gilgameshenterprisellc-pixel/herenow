import { supabase } from './supabase'

export interface ChatMessage {
  id: string
  zone_id: string
  user_id: string
  session_id: string | null
  content: string
  created_at: string
  expires_at: string
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
