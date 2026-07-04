import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getUnreadCount } from '@/lib/notifications'
import { getDmUnreadCount } from '@/lib/messages'
import { supabase } from '@/lib/supabase'
import OnboardingModal from '@/components/OnboardingModal'

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
        size={24}
        color={focused ? '#29B6F6' : '#4A6580'}
      />
      {badge && badge > 0 ? (
        <View style={ti.badge}>
          <Text style={ti.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
      {focused && <View style={ti.activeDot} />}
    </View>
  )
}

const ti = StyleSheet.create({
  wrap: {
    width: 52, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, position: 'relative',
  },
  wrapFocused: { backgroundColor: '#29B6F610' },
  badge: {
    position: 'absolute', top: 2, right: 4,
    backgroundColor: '#29B6F6', borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#050A15',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#050A15' },
  activeDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#29B6F6', position: 'absolute', bottom: 2,
  },
})

export default function TabsLayout() {
  const [unread, setUnread]       = useState(0)  // system notification count → Updates tab
  const [dmUnread, setDmUnread]   = useState(0)  // DM unread count → Messages tab

  useEffect(() => {
    let mounted = true
    let notifSub: ReturnType<typeof supabase.channel> | null = null
    let dmSub: ReturnType<typeof supabase.channel> | null = null

    const fetchUnread = async () => {
      const [notifCount, dmCount] = await Promise.all([getUnreadCount(), getDmUnreadCount()])
      if (mounted) {
        setUnread(notifCount)
        setDmUnread(dmCount)
      }
    }

    const init = async () => {
      await fetchUnread()
      if (!mounted) return

      // Get user ID so subscriptions are scoped to only this user's rows,
      // preventing every connected client from refetching on every app-wide insert.
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      const uid = user?.id

      notifSub = supabase
        .channel('badge-notif')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          ...(uid ? { filter: `user_id=eq.${uid}` } : {}),
        }, fetchUnread)
        .subscribe()

      dmSub = supabase
        .channel('badge-dm')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          ...(uid ? { filter: `recipient_id=eq.${uid}` } : {}),
        }, fetchUnread)
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
    <>
      <OnboardingModal onDone={() => {}} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="map-outline" nameFocused="map" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="feed"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="bell-outline" nameFocused="bell" focused={focused} badge={unread} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="mail-outline" nameFocused="mail" focused={focused} badge={dmUnread} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="person-circle-outline" nameFocused="person-circle" focused={focused} />
            ),
          }}
        />
      </Tabs>
    </>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    borderRadius: 36,
    height: 66,
    paddingBottom: 0,
    paddingTop: 0,
    backgroundColor: '#07101F',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    ...Platform.select({
      web: {
        // Fixed centered pill on web — works for any viewport width
        position: 'fixed' as any,
        left: 0,
        right: 0,
        bottom: 20,
        maxWidth: 480,
        width: 'calc(100% - 32px)' as any,
        marginLeft: 'auto' as any,
        marginRight: 'auto' as any,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(41,182,246,0.07)',
      } as any,
      default: {
        position: 'absolute',
        bottom: 20,
        left: 16,
        right: 16,
        shadowColor: '#29B6F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 20,
      },
    }),
  },
})
