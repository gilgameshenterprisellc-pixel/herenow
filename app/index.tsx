import { Redirect } from 'expo-router'
import { useAuth } from '@/hooks/useAuth'
import { View, ActivityIndicator } from 'react-native'

export default function Index() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f59e0b" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  return <Redirect href="/(tabs)" />
}
