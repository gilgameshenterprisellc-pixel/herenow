import { useEffect, useState } from 'react'
import { Tabs, usePathname, router } from 'expo-router'
import { View, Text, StyleSheet, Platform, Image, TouchableOpacity, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getUnreadCount } from '@/lib/notifications'
import { getDmUnreadCount } from '@/lib/messages'
import { supabase } from '@/lib/supabase'
import OnboardingModal from '@/components/OnboardingModal'
import { TabBarScrollProvider, TabBarScrollContext } from '@/contexts/TabBarScrollContext'
import { useContext } from 'react'

/** Bottom inset that all tab screens need to add so content clears the floating bar */
export const TAB_SAFE_BOTTOM = 108

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, nameFocused, focused, badge }: {
  name: IoniconsName
  nameFocused: IoniconsName
  focused: boolean
  badge?: number
}) {
  return (
    <View style={[ti.wrap, focused && ti.wrapFocused]}>
      <Ionicons
        name={focused ? nameFocused : name}
        size={22}
        color={focused ? '#29B6F6' : '#4A6580'}
      />
      {badge && badge > 0 ? (
        <View style={ti.badge}>
          <Text style={ti.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </View>
  )
}

function ProfileTabIcon({ avatarUrl, focused }: { avatarUrl: string | null; focused: boolean }) {
  return (
    <View style={[ti.wrap, focused && ti.wrapFocused]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[ti.avatar, focused && { borderColor: '#29B6F6', borderWidth: 2 }]}
        />
      ) : (
        <Ionicons
          name={focused ? 'person-circle' : 'person-circle-outline'}
          size={22}
          color={focused ? '#29B6F6' : '#4A6580'}
        />
      )}
    </View>
  )
}

const ti = StyleSheet.create({
  wrap: {
    width: 52, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, position: 'relative',
  },
  wrapFocused: { backgroundColor: '#29B6F61C' },
  badge: {
    position: 'absolute', top: 2, right: 4,
    backgroundColor: '#29B6F6', borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#050A15',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#050A15' },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: 'rgba(41,182,246,0.3)',
  },
})

// ─── Floating animated tab bar ───────────────────────────────────────────────

interface FloatingTabBarProps {
  unread: number
  dmUnread: number
  avatarUrl: string | null
}

function FloatingTabBar({ unread, dmUnread, avatarUrl }: FloatingTabBarProps) {
  const ctx = useContext(TabBarScrollContext)
  const translateY = ctx?.translateY ?? new Animated.Value(0)
  const pathname = usePathname()

  const tabs: {
    route: string
    push: Parameters<typeof router.push>[0]
    icon: IoniconsName
    iconFocused: IoniconsName
    badge?: number
    isProfile?: boolean
  }[] = [
    { route: '/',              push: '/(tabs)/',              icon: 'map-outline',           iconFocused: 'map'           },
    { route: '/feed',          push: '/(tabs)/feed',          icon: 'megaphone-outline',     iconFocused: 'megaphone',    badge: unread },
    { route: '/notifications', push: '/(tabs)/notifications', icon: 'mail-outline',          iconFocused: 'mail',         badge: dmUnread },
    { route: '/profile',       push: '/(tabs)/profile',       icon: 'person-circle-outline', iconFocused: 'person-circle', isProfile: true },
  ]

  return (
    <Animated.View
      style={[
        tabStyles.bar,
        { transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      {tabs.map((tab) => {
        const focused = tab.route === '/'
          ? (pathname === '/' || pathname === '/(tabs)/')
          : pathname.endsWith(tab.route)
        return (
          <TouchableOpacity
            key={tab.route}
            onPress={() => router.push(tab.push)}
            style={tabStyles.item}
            activeOpacity={0.8}
          >
            {tab.isProfile ? (
              <ProfileTabIcon avatarUrl={avatarUrl} focused={focused} />
            ) : (
              <TabIcon
                name={tab.icon}
                nameFocused={tab.iconFocused}
                focused={focused}
                badge={tab.badge}
              />
            )}
          </TouchableOpacity>
        )
      })}
    </Animated.View>
  )
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 36,
    height: 66,
    backgroundColor: '#07101F',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        left: 0, right: 0, bottom: 20,
        maxWidth: 480,
        width: 'calc(100% - 32px)' as any,
        marginLeft: 'auto' as any, marginRight: 'auto' as any,
        zIndex: 100,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(41,182,246,0.07)',
      } as any,
      default: {
        position: 'absolute',
        bottom: 20, left: 16, right: 16,
        shadowColor: '#29B6F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1, shadowRadius: 24, elevation: 20,
      },
    }),
  },
  item: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
})

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const [unread, setUnread]       = useState(0)
  const [dmUnread, setDmUnread]   = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let notifSub: ReturnType<typeof supabase.channel> | null = null
    let dmSub: ReturnType<typeof supabase.channel> | null = null

    const fetchUnread = async () => {
      const [notifCount, dmCount] = await Promise.all([getUnreadCount(), getDmUnreadCount()])
      if (mounted) { setUnread(notifCount); setDmUnread(dmCount) }
    }

    const init = async () => {
      await fetchUnread()
      if (!mounted) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      const uid = user?.id

      if (uid) {
        const { data: profile } = await supabase
          .from('profiles').select('avatar_url').eq('id', uid).maybeSingle()
        if (mounted && profile?.avatar_url) setAvatarUrl(profile.avatar_url)
      }

      notifSub = supabase.channel('badge-notif')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications',
          ...(uid ? { filter: `user_id=eq.${uid}` } : {}) }, fetchUnread)
        .subscribe()

      dmSub = supabase.channel('badge-dm')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages',
          ...(uid ? { filter: `recipient_id=eq.${uid}` } : {}) }, fetchUnread)
        .subscribe()
    }

    init()
    const interval = setInterval(fetchUnread, 30_000)

    return () => {
      mounted = false
      clearInterval(interval)
      if (notifSub) supabase.removeChannel(notifSub)
      if (dmSub) supabase.removeChannel(dmSub)
    }
  }, [])

  return (
    <TabBarScrollProvider>
      <View style={{ flex: 1 }}>
        <OnboardingModal onDone={() => {}} />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { display: 'none' },
          }}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="feed" />
          <Tabs.Screen name="notifications" />
          <Tabs.Screen name="profile" />
        </Tabs>
        <FloatingTabBar unread={unread} dmUnread={dmUnread} avatarUrl={avatarUrl} />
      </View>
    </TabBarScrollProvider>
  )
}
