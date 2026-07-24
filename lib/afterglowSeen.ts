import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

// Tracks whether the user has a night recap they haven't opened yet, so the
// "Your Nights" entry can show an unseen dot (Jacob: "a little notification on
// that tab when the new recap is available"). Purely client-side — we store the
// created_at of the newest afterglow the user has viewed and compare.
const KEY = 'herenow_afterglow_last_seen'

async function newestAfterglowAt(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('afterglow')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.created_at ?? null
}

// True when the newest afterglow is newer than the last one the user opened.
export async function hasUnseenAfterglow(): Promise<boolean> {
  try {
    const newest = await newestAfterglowAt()
    if (!newest) return false
    const seen = await AsyncStorage.getItem(KEY)
    return !seen || new Date(newest).getTime() > new Date(seen).getTime()
  } catch {
    return false
  }
}

// Called when the user opens the Your Nights library — clears the dot.
export async function markAfterglowsSeen(): Promise<void> {
  try {
    const newest = await newestAfterglowAt()
    if (newest) await AsyncStorage.setItem(KEY, newest)
  } catch {
    /* non-fatal */
  }
}
