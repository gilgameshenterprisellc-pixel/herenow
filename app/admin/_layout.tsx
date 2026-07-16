import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Slot, router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'

export default function AdminLayout() {
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const check = async () => {
      const user = await getAuthedUser()
      if (!user) { router.replace('/(auth)/login'); return }

      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (!data?.is_admin) {
        router.replace('/(tabs)')
        return
      }
      setChecking(false)
    }
    check()
  }, [])

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#29B6F6" size="large" />
      </View>
    )
  }

  return <Slot />
}
