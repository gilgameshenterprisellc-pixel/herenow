import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Platform,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionContext } from '@/contexts/SessionContext'
import { fetchUserBadges } from '@/lib/badges'
import AvatarImage from '@/components/AvatarImage'
import { TAB_SAFE_BOTTOM } from './_layout'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

interface Profile {
  id: string
  display_name: string
  username: string
  bio: string | null
  age_range: string | null
  interest_tags: string[]
  kickoffs: string[]
  avatar_url: string | null
  is_venue_owner: boolean
  venue_status: string | null
}

interface NavItem {
  label: string
  route: string
  icon: IoniconsName
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [loading, setLoading]       = useState(true)
  const [badgeCount, setBadgeCount] = useState(0)
  const { activeSession }           = useSessionContext()

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const [{ data: p }, earned] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      fetchUserBadges(user.id),
    ])

    setProfile(p)
    setBadgeCount(earned.length)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSignOut = async () => {
    if (Platform.OS !== 'web') {
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
    } else {
      // Full page reload clears the JS auth cache completely.
      // router.replace('/') leaves stale session in memory → lands on tabs, not landing page.
      await supabase.auth.signOut()
      ;(window as any).location.replace('/')
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  // Build nav items dynamically — only venue owners see the venue item
  const baseNav: NavItem[] = [
    { label: 'We Met',    route: '/we-met',     icon: 'people-outline' },
    { label: 'Messages',  route: '/messages',   icon: 'chatbubble-ellipses-outline' },
    { label: 'My Venues', route: '/my-venues',  icon: 'business-outline' },
    { label: 'Badges',    route: '/badges',     icon: 'ribbon-outline' },
  ]

  const venueNav: NavItem | null = profile?.is_venue_owner
    ? {
        label: profile.venue_status === 'approved' ? 'Venue Dashboard' : 'Venue Status',
        route: '/venue/dashboard',
        icon: profile.venue_status === 'approved' ? 'business-outline' : 'time-outline',
      }
    : null

  const navItems: NavItem[] = venueNav ? [...baseNav, venueNav] : baseNav

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: TAB_SAFE_BOTTOM }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar + name */}
      <Reanimated.View entering={FadeInDown.delay(0).duration(450)} style={[styles.profileHead, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.push('/profile/edit')} style={styles.avatarWrap}>
          <AvatarImage uri={profile?.avatar_url} name={profile?.display_name ?? '?'} size={88} />
          <View style={styles.cameraOverlay}>
            <Ionicons name="camera" size={13} color="#8EADC7" />
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
      </Reanimated.View>

      {/* Stats row */}
      <Reanimated.View entering={FadeInDown.delay(80).duration(450)} style={styles.statsRow}>
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
      </Reanimated.View>

      {/* Active session card */}
      {activeSession && (
        <Reanimated.View entering={FadeInDown.delay(140).duration(450)}>
          <TouchableOpacity
            style={styles.sessionCard}
            onPress={() => router.push(`/zone/${activeSession.zone_id}`)}
          >
            <View style={styles.sessionDot} />
            <Text style={styles.sessionText}>Checked in — tap to return to venue</Text>
            <Ionicons name="chevron-forward" size={16} color="#22c55e" />
          </TouchableOpacity>
        </Reanimated.View>
      )}

      {/* Edit profile */}
      <Reanimated.View entering={FadeInDown.delay(160).duration(450)}>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push('/profile/edit')}
        >
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </Reanimated.View>

      {/* Nav links */}
      <Reanimated.View entering={FadeInDown.delay(220).duration(450)} style={styles.navList}>
        {navItems.map((item, i) => (
          <TouchableOpacity
            key={item.route}
            style={[styles.navItem, i < navItems.length - 1 && styles.navItemBorder]}
            onPress={() => router.push(item.route as any)}
          >
            <Ionicons name={item.icon} size={20} color="#5A7A9A" style={styles.navIcon} />
            <Text style={styles.navLabel}>{item.label}</Text>
            {item.route === '/venue/dashboard' && profile?.venue_status === 'pending' && (
              <View style={styles.pendingPill}>
                <Text style={styles.pendingPillText}>Pending</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color="#2A3F55" />
          </TouchableOpacity>
        ))}
      </Reanimated.View>

      {/* Sign out */}
      <Reanimated.View entering={FadeInDown.delay(300).duration(450)}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </Reanimated.View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  content: {
    gap: 12,
    ...Platform.select({
      web: { maxWidth: 640, alignSelf: 'center' as const, width: '100%' as any } as any,
      default: {},
    }),
  },
  profileHead: {
    alignItems: 'center',
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
    gap: 12,
  },
  navItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A2E4A',
  },
  navIcon: { width: 24 },
  navLabel: { flex: 1, fontSize: 15, color: '#f8fafc', fontWeight: '500' },
  pendingPill: {
    backgroundColor: '#f59e0b20',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#f59e0b44',
  },
  pendingPillText: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
  signOutBtn: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ef444430',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
})
