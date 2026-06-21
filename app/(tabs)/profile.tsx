import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionContext } from '@/contexts/SessionContext'
import { fetchUserBadges } from '@/lib/badges'
import AvatarImage from '@/components/AvatarImage'
import { TAB_SAFE_BOTTOM } from './_layout'

interface Profile {
  id: string
  display_name: string
  username: string
  bio: string | null
  age_range: string | null
  interest_tags: string[]
  kickoffs: string[]
  avatar_url: string | null
}

const NAV_ITEMS = [
  { label: '🤝 We Met',        route: '/we-met' },
  { label: '💌 Messages',      route: '/messages' },
  { label: '🏅 Badges',        route: '/badges' },
  { label: '➕ Add a Venue',   route: '/zone/create' },
]

export default function ProfileScreen() {
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [loading, setLoading]       = useState(true)
  const [badgeCount, setBadgeCount] = useState(0)
  const { activeSession }           = useSessionContext()

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const [{ data: p }, earned] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      fetchUserBadges(user.id),
    ])

    setProfile(p)
    setBadgeCount(earned.length)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Avatar + name */}
      <View style={styles.profileHead}>
        <TouchableOpacity onPress={() => router.push('/profile/edit')} style={styles.avatarWrap}>
          <AvatarImage uri={profile?.avatar_url} name={profile?.display_name ?? '?'} size={88} />
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraIcon}>📷</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.displayName}>{profile?.display_name}</Text>
        <Text style={styles.username}>@{profile?.username}</Text>
        {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        {profile?.kickoffs?.[0] && (
          <View style={styles.kickoffBubble}>
            <Text style={styles.kickoffText}>"{profile.kickoffs[0]}"</Text>
          </View>
        )}
        {(profile?.interest_tags ?? []).length > 0 && (
          <View style={styles.tags}>
            {profile!.interest_tags.slice(0, 6).map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{badgeCount}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{activeSession ? '1' : '0'}</Text>
          <Text style={styles.statLabel}>Active session</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{profile?.age_range ?? '–'}</Text>
          <Text style={styles.statLabel}>Age range</Text>
        </View>
      </View>

      {/* Active session card */}
      {activeSession && (
        <TouchableOpacity
          style={styles.sessionCard}
          onPress={() => router.push(`/zone/${activeSession.zone_id}`)}
        >
          <View style={styles.sessionDot} />
          <Text style={styles.sessionText}>
            Checked in — tap to return to venue
          </Text>
          <Text style={styles.sessionArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Edit profile */}
      <TouchableOpacity
        style={styles.editBtn}
        onPress={() => router.push('/profile/edit')}
      >
        <Text style={styles.editBtnText}>Edit Profile</Text>
      </TouchableOpacity>

      {/* Nav links */}
      <View style={styles.navList}>
        {NAV_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.navItem}
            onPress={() => router.push(item.route as any)}
          >
            <Text style={styles.navLabel}>{item.label}</Text>
            <Text style={styles.navArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: TAB_SAFE_BOTTOM, gap: 16 },
  profileHead: {
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 24,
    paddingHorizontal: 24,
    gap: 6,
  },
  avatarWrap: { position: 'relative', marginBottom: 10 },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0D1B2E', borderWidth: 2, borderColor: '#050A15',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraIcon: { fontSize: 13 },
  displayName: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  username: { fontSize: 14, color: '#7A93AC' },
  bio: { fontSize: 14, color: '#8EADC7', textAlign: 'center', lineHeight: 20, marginTop: 4 },
  kickoffBubble: {
    backgroundColor: '#0D1B2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 8,
    maxWidth: 280,
  },
  kickoffText: { fontSize: 13, color: '#8EADC7', fontStyle: 'italic', textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 },
  tag: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  tagText: { fontSize: 12, color: '#7A93AC' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  statLabel: { fontSize: 10, color: '#7A93AC' },
  statDivider: { width: 1, height: 28, backgroundColor: '#1A2E4A' },
  sessionCard: {
    marginHorizontal: 16,
    backgroundColor: '#22c55e12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e44',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  sessionText: { flex: 1, fontSize: 13, color: '#22c55e', fontWeight: '600' },
  sessionArrow: { fontSize: 16, color: '#22c55e' },
  editBtn: {
    marginHorizontal: 16,
    backgroundColor: '#0D1B2E',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  editBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 15 },
  navList: {
    marginHorizontal: 16,
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    overflow: 'hidden',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2E4A',
  },
  navLabel: { flex: 1, fontSize: 15, color: '#f8fafc', fontWeight: '500' },
  navArrow: { fontSize: 20, color: '#7A93AC' },
  signOutBtn: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
})
