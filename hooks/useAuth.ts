import { useEffect, useState } from 'react'
import { Alert, Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { watchAuth } from '@/lib/authWatch'

// A banned account gets ejected here, in the one place every screen's session
// state flows through. Checking is_banned on the client rather than only at
// the RLS layer means a suspended user is actually signed out and sent to the
// login screen with a reason, not just silently unable to post anymore.
async function ejectIfBanned(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return false

  const { data } = await supabase
    .from('profiles')
    .select('is_banned')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!data?.is_banned) return false

  await supabase.auth.signOut()
  const message = 'Your account has been suspended for violating our Community Guidelines. Contact support@herenowsocial.com if you believe this is a mistake.'
  if (Platform.OS === 'web') {
    window.alert(message)
  } else {
    Alert.alert('Account suspended', message)
  }
  return true
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // The ban check runs outside supabase-js's auth listener. Awaiting it inside
  // the listener froze the launch screen whenever the app opened with an
  // expired token (Jacob and Jamie, Oct 2026); lib/authWatch.ts explains why.
  useEffect(() => watchAuth(supabase, {
    isBanned: ejectIfBanned,
    onSession: (next) => {
      setSession(next)
      setLoading(false)
    },
  }), [])

  return { session, loading }
}
