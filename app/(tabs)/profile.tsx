import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Platform, Image,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { hasUnseenAfterglow } from '@/lib/afterglowSeen'
import { useSessionContext } from '@/contexts/SessionContext'
import { fetchUserBadges } from '@/lib/badges'
import { fetchConfirmedWeMets, type WeMet } from '@/lib/weMet'
import { checkOutActiveOnSignOut } from '@/lib/sessions'
import AvatarImage from '@/components/AvatarImage'
import FounderBadge from '@/components/FounderBadge'
import { TAB_SAFE_BOTTOM } from './_layout'
import { useTabBarScroll } from '@/contexts/TabBarScrollContext'

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
  is_admin: boolean | null
  is_founder: boolean | null
  social_mode: string | null
  mood_mode: string | null
  ghost_mode: boolean | null
  created_at: string | null
}

function formatJoined(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `Joined ${d.toLocaleString('default', { month: 'long' })} ${d.getFullYear()}`
}

interface NavItem {
  label: string
  route: string
  icon: IoniconsName
}

const SOCIAL_MODES = [
  { value: 'just_vibes', label: 'Vibes' },
  { value: 'friends',    label: 'Friends' },
  { value: 'networking', label: 'Network' },
  { value: 'dating',     label: 'Dating' },
]

const MOOD_MODES = [
  { value: 'open',       label: 'Open' },
  { value: 'selective',  label: 'Selective' },
  { value: 'not_today',  label: 'Not Today' },
]

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { onScroll } = useTabBarScroll()
  const [profile, setProfile]               = useState<Profile | null>(null)
  const [hasUnseenRecap, setHasUnseenRecap] = useState(false)
  const [loading, setLoading]               = useState(true)
  const [userId, setUserId]                 = useState<string | null>(null)
  const [badgeCount, setBadgeCount]         = useState(0)
  const [checkinCount, setCheckinCount]     = useState(0)
  const [connectionCount, setConnectionCount] = useState(0)
  const [venueCount, setVenueCount]         = useState(0)
  const [wemetHistory, setWemetHistory]     = useState<{ id: string; userId: string | null; name: string; avatar: string | null; zone: string | null; when: string | null }[]>([])
  const { activeSession }                   = useSessionContext()

  const load = async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const [profileRes, earned, sessRes, connRes, venueRes, wemets] = await Promise.all([
      supabase.from('profiles').select('*, created_at').eq('id', user.id).maybeSingle(),
      fetchUserBadges(user.id),
      supabase.from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('checked_out_at', 'is', null),
      supabase.from('we_met')
        .select('*', { count: 'exact', head: true })
        .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .eq('status', 'confirmed'),
      supabase.from('venue_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id),
      fetchConfirmedWeMets(),
    ])

    setProfile(profileRes.data)
    setUserId(user.id)
    setBadgeCount(earned.length)
    setCheckinCount(sessRes.count ?? 0)
    setConnectionCount(connRes.count ?? 0)
    setVenueCount(venueRes.count ?? 0)

    // We Met history — private to you (RLS scopes we_met to the two parties).
    // Map each row to the *other* person.
    setWemetHistory(
      (wemets as WeMet[]).map((wm) => {
        const other = wm.initiator_id === user.id ? wm.recipient_profile : wm.initiator_profile
        return {
          id:     wm.id,
          userId: other?.id ?? (wm.initiator_id === user.id ? wm.recipient_id : wm.initiator_id),
          name:   other?.display_name ?? 'Someone',
          avatar: other?.avatar_url ?? null,
          zone:   null,
          when:   wm.confirmed_at,
        }
      })
    )
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateMode = async (field: 'social_mode' | 'mood_mode', value: string) => {
    if (!userId) return
    setProfile((prev) => prev ? { ...prev, [field]: value } : null)
    await supabase.from('profiles').update({ [field]: value }).eq('id', userId)
  }

  const handleSignOut = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Sign out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Leaving the app must end any active check-in first (safety).
              await checkOutActiveOnSignOut()
              await supabase.auth.signOut()
              router.replace('/(auth)/login')
            } catch {
              Alert.alert('Error', 'Could not sign out. Try again.')
            }
          },
        },
      ])
    } else {
      try {
        // Leaving the app must end any active check-in first (safety).
        await checkOutActiveOnSignOut()
        // Full page reload clears the JS auth cache completely.
        // router.replace('/') leaves stale session in memory → lands on tabs, not landing page.
        await supabase.auth.signOut()
        ;(window as any).location.replace('/')
      } catch {
        ;(window as any).location.replace('/')
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  // Refresh the unseen-recap dot on the "Your Nights" row every time the tab is
  // focused, so it clears right after the user opens the library and comes back.
  useFocusEffect(
    useCallback(() => {
      hasUnseenAfterglow().then(setHasUnseenRecap)
    }, [])
  )

  // Build nav items dynamically — only venue owners see the venue item
  const isVenueOwner = !!profile?.is_venue_owner

  const baseNav: NavItem[] = isVenueOwner
    ? [
        { label: 'Messages',  route: '/messages',  icon: 'chatbubble-ellipses-outline' },
        { label: 'My Venues', route: '/my-venues', icon: 'business-outline' },
        { label: 'Settings',  route: '/settings',  icon: 'settings-outline' },
      ]
    : [
        { label: 'We Met',    route: '/we-met',    icon: 'people-outline' },
        { label: 'My Circle', route: '/circle',    icon: 'ellipse-outline' },
        { label: 'Messages',  route: '/messages',  icon: 'chatbubble-ellipses-outline' },
        { label: 'My Venues', route: '/my-venues', icon: 'business-outline' },
        { label: 'Organizations', route: '/org',   icon: 'trophy-outline' },
        { label: 'Your Nights', route: '/afterglow', icon: 'moon-outline' },
        { label: 'Badges',    route: '/badges',    icon: 'ribbon-outline' },
        { label: 'Settings',  route: '/settings',  icon: 'settings-outline' },
      ]

  const venueNav: NavItem | null = profile?.is_venue_owner
    ? {
        label: profile.venue_status === 'approved' ? 'Venue Dashboard' : 'Venue Status',
        route: '/venue/dashboard',
        icon: profile.venue_status === 'approved' ? 'business-outline' : 'time-outline',
      }
    : null

  const adminNav: NavItem | null = profile?.is_admin
    ? { label: 'Admin Panel', route: '/admin', icon: 'shield-checkmark-outline' }
    : null

  const navItems: NavItem[] = [
    ...baseNav,
    ...(venueNav ? [venueNav] : []),
    ...(adminNav ? [adminNav] : []),
    // Anonymous feedback survey — sits directly above Sign Out (Jacob).
    { label: 'Take the Survey', route: '/survey', icon: 'clipboard-outline' },
  ]

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: TAB_SAFE_BOTTOM }]}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
    >
      {/* Avatar + name */}
      <Reanimated.View entering={FadeInDown.delay(0).duration(450)} style={[styles.profileHead, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.push('/profile/edit')} style={styles.avatarWrap}>
          <AvatarImage uri={profile?.avatar_url} name={profile?.display_name ?? '?'} size={88} />
          <View style={styles.cameraOverlay}>
            <Ionicons name="camera" size={13} color="#8EADC7" />
          </View>
        </TouchableOpacity>
        <View style={styles.nameRow}>
          <Text style={styles.displayName}>{profile?.display_name}</Text>
          {profile?.is_founder && <FounderBadge size={18} />}
        </View>
        <Text style={styles.username}>@{profile?.username}</Text>
        {profile?.created_at && (
          <Text style={styles.joinedDate}>{formatJoined(profile.created_at)}</Text>
        )}
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

      {/* Stats row — simplified for venue owners */}
      {!isVenueOwner && (
        <Reanimated.View entering={FadeInDown.delay(80).duration(450)} style={styles.statsRow}>
          <TouchableOpacity style={styles.stat} onPress={() => router.push('/we-met')}>
            <Text style={styles.statNum}>{connectionCount}</Text>
            <Text style={styles.statLabel}>Connections</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{checkinCount}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{venueCount}</Text>
            <Text style={styles.statLabel}>Venues</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.stat} onPress={() => router.push('/badges')}>
            <Text style={styles.statNum}>{badgeCount}</Text>
            <Text style={styles.statLabel}>Badges</Text>
          </TouchableOpacity>
        </Reanimated.View>
      )}

      {/* Ghost Mode active banner (ghost is its own toggle now, set in Settings) */}
      {!isVenueOwner && profile?.ghost_mode === true && (
        <Reanimated.View entering={FadeInDown.delay(100).duration(350)} style={styles.ghostBanner}>
          <Ionicons name="eye-off" size={20} color="#7A93AC" />
          <View style={styles.ghostBannerText}>
            <Text style={styles.ghostBannerTitle}>Ghost Mode Active</Text>
            <Text style={styles.ghostBannerSub}>No one can approach, tag, or DM you.</Text>
          </View>
        </Reanimated.View>
      )}

      {/* Mode quick-toggle — not relevant for venue accounts */}
      {!isVenueOwner && (
      <Reanimated.View entering={FadeInDown.delay(110).duration(450)} style={[
        styles.modeCard,
        profile?.ghost_mode === true && styles.modeCardGhost,
      ]}>
        <Text style={styles.modeSectionTitle}>My Mode</Text>
        <Text style={styles.modeSectionSub}>Active now · shown when you check in</Text>

        <View style={styles.modeGroup}>
          <Text style={styles.modeGroupLabel}>VIBE</Text>
          <View style={styles.modePills}>
            {SOCIAL_MODES.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[styles.modePill, profile?.social_mode === m.value && styles.modePillActive]}
                onPress={() => updateMode('social_mode', m.value)}
              >
                <Text style={[styles.modePillText, profile?.social_mode === m.value && styles.modePillTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.modeGroup, styles.modeGroupBorder]}>
          <Text style={styles.modeGroupLabel}>MOOD</Text>
          <View style={styles.modePills}>
            {MOOD_MODES.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[
                  styles.modePill,
                  profile?.mood_mode === m.value && styles.modePillActive,
                ]}
                onPress={() => updateMode('mood_mode', m.value)}
              >
                <Text style={[
                  styles.modePillText,
                  profile?.mood_mode === m.value && styles.modePillTextActive,
                ]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Reanimated.View>
      )}

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

      {/* Profile completeness */}
      {!isVenueOwner && (() => {
        const fields = [
          !!profile?.avatar_url,
          !!(profile?.bio?.trim()),
          (profile?.interest_tags?.length ?? 0) > 0,
          (profile?.kickoffs?.length ?? 0) > 0,
          !!profile?.age_range,
        ]
        const pct = Math.round((fields.filter(Boolean).length / fields.length) * 100)
        if (pct >= 100) return null
        return (
          <Reanimated.View entering={FadeInDown.delay(155).duration(450)} style={styles.completeWrap}>
            <View style={styles.completeRow}>
              <Text style={styles.completeLabel}>Profile {pct}% complete</Text>
              <TouchableOpacity onPress={() => router.push('/profile/edit')}>
                <Text style={styles.completeAction}>Finish →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.completeTrack}>
              <View style={[styles.completeFill, { width: `${pct}%` as any }]} />
            </View>
          </Reanimated.View>
        )
      })()}

      {/* We Met history — private to you */}
      {wemetHistory.length > 0 && (
        <Reanimated.View entering={FadeInDown.delay(140).duration(450)} style={styles.wemetCard}>
          <View style={styles.wemetHeader}>
            <Text style={styles.wemetTitle}>People you've met</Text>
            <View style={styles.wemetLockRow}>
              <Ionicons name="lock-closed" size={11} color="#4A6580" />
              <Text style={styles.wemetPrivate}>Only you can see this</Text>
            </View>
          </View>
          <View style={styles.wemetGrid}>
            {wemetHistory.slice(0, 12).map((w) => (
              <TouchableOpacity
                key={w.id}
                style={styles.wemetItem}
                onPress={() => w.userId && router.push(`/u/${w.userId}` as any)}
                activeOpacity={0.7}
              >
                {w.avatar ? (
                  <Image source={{ uri: w.avatar }} style={styles.wemetAvatar} />
                ) : (
                  <View style={[styles.wemetAvatar, styles.wemetAvatarFallback]}>
                    <Text style={styles.wemetAvatarLetter}>{w.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.wemetName} numberOfLines={1}>{w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {wemetHistory.length > 12 && (
            <Text style={styles.wemetMore}>+{wemetHistory.length - 12} more connections</Text>
          )}
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
            {item.route === '/afterglow' && hasUnseenRecap && <View style={styles.navDot} />}
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  displayName: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  username:   { fontSize: 14, color: '#7A93AC' },
  joinedDate: { fontSize: 12, color: '#3D5A73', marginTop: 1 },
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
  ghostBanner: {
    marginHorizontal: 16,
    backgroundColor: '#1a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef444440',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ghostBannerIcon: { fontSize: 28 },
  ghostBannerText: { flex: 1, gap: 2 },
  ghostBannerTitle: { fontSize: 14, fontWeight: '800', color: '#ef4444' },
  ghostBannerSub:   { fontSize: 12, color: '#7A4444', lineHeight: 16 },
  modeCard: {
    marginHorizontal: 16,
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    padding: 14,
    gap: 12,
  },
  modeCardGhost: {
    backgroundColor: '#150808',
    borderColor: '#ef444430',
  },
  modeSectionTitle: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  modeSectionSub: { fontSize: 11, color: '#4A6580', marginTop: -8 },
  modeGroup: { gap: 8 },
  modeGroupBorder: { borderTopWidth: 1, borderTopColor: '#1A2E4A', paddingTop: 12 },
  modeGroupLabel: {
    fontSize: 10, fontWeight: '700', color: '#8EADC7',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  modePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modePill: {
    backgroundColor: '#0B1526',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  modePillActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  modePillGhost:  { backgroundColor: '#ef444415', borderColor: '#ef444440' },
  modePillText: { fontSize: 12, color: '#7A93AC', fontWeight: '600' },
  modePillTextActive: { color: '#29B6F6' },
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
  wemetCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#0D1B2E', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 12,
  },
  wemetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wemetTitle: { fontSize: 15, fontWeight: '800', color: '#f0f8ff' },
  wemetLockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wemetPrivate: { fontSize: 10, color: '#4A6580', fontWeight: '600' },
  wemetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  wemetItem: { width: 60, alignItems: 'center', gap: 4 },
  wemetAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1A2E4A' },
  wemetAvatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#29B6F640' },
  wemetAvatarLetter: { color: '#29B6F6', fontSize: 20, fontWeight: '800' },
  wemetName: { fontSize: 10, color: '#7A93AC', fontWeight: '600', maxWidth: 58, textAlign: 'center' },
  wemetMore: { fontSize: 12, color: '#4A6580', textAlign: 'center' },
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
  navDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#29B6F6', marginRight: 8 },
  pendingPill: {
    backgroundColor: '#f59e0b20',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#f59e0b44',
  },
  pendingPillText: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
  completeWrap: {
    marginHorizontal: 16,
    gap: 8,
  },
  completeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completeLabel: { fontSize: 12, color: '#7A93AC', fontWeight: '600' },
  completeAction: { fontSize: 12, color: '#29B6F6', fontWeight: '700' },
  completeTrack: {
    height: 4,
    backgroundColor: '#0D1B2E',
    borderRadius: 2,
    overflow: 'hidden',
  },
  completeFill: {
    height: '100%',
    backgroundColor: '#29B6F6',
    borderRadius: 2,
    minWidth: 4,
  },
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
