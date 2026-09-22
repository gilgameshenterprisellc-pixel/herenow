import { useEffect, useState } from 'react'
import { Alert, Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const ejected = await ejectIfBanned(session)
      if (cancelled) return
      setSession(ejected ? null : session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const ejected = await ejectIfBanned(session)
      if (cancelled) return
      setSession(ejected ? null : session)
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  return { session, loading }
}
