import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface Profile {
  id: string
  display_name: string
  username: string
  bio: string | null
  avatar_url: string | null
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [zoneCount, setZoneCount] = useState(0)
  const [postCount, setPostCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }

      const [{ data: p }, { count: zc }, { count: pc }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('zone_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('zone_posts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      setProfile(p)
      setZoneCount(zc ?? 0)
      setPostCount(pc ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  const handleSignOut = async () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#f59e0b" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.displayName}>{profile?.display_name}</Text>
        <Text style={styles.username}>@{profile?.username}</Text>
        {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{zoneCount}</Text>
            <Text style={styles.statLabel}>Zones</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{postCount}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', paddingTop: 72, paddingBottom: 32, paddingHorizontal: 24 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: { fontSize: 36, fontWeight: '800', color: '#0f172a' },
  displayName: { fontSize: 22, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  username: { fontSize: 14, color: '#64748b', marginBottom: 8 },
  bio: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
    marginTop: 24,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#f8fafc' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: '#334155' },
  actions: { paddingHorizontal: 24, paddingTop: 16 },
  signOutBtn: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
})
