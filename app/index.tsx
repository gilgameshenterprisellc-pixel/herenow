import { Redirect } from 'expo-router'
import { useAuth } from '@/hooks/useAuth'
import { View, ActivityIndicator } from 'react-native'

export default function Index() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  return <Redirect href="/(tabs)" />
}
