import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { getUnreadCount } from '@/lib/notifications'
import { supabase } from '@/lib/supabase'
import OnboardingModal from '@/components/OnboardingModal'

/** Bottom inset that all tab screens need to add so content clears the floating bar */
export const TAB_SAFE_BOTTOM = 108

function TabIcon({ emoji, label, focused, badge }: {
  emoji: string; label: string; focused: boolean; badge?: number
}) {
  return (
    <View style={[ti.wrap, focused && ti.wrapFocused]}>
      <Text style={[ti.emoji, focused && ti.emojiFocused]}>{emoji}</Text>
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
    borderRadius: 22, position: 'relative', gap: 2,
  },
  wrapFocused: { backgroundColor: '#29B6F610' },
  emoji: { fontSize: 22, opacity: 0.4 },
  emojiFocused: { opacity: 1 },
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
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const fetchUnread = async () => {
      const count = await getUnreadCount()
      setUnread(count)
    }

    fetchUnread()
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchUnread, 30_000)

    // Also refresh on realtime notification inserts
    const sub = supabase
      .channel('notif-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, fetchUnread)
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(sub)
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
            <TabIcon emoji="🗺️" label="Nearby" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📡" label="Feed" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🔔" label="Alerts" focused={focused} badge={unread} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" label="You" focused={focused} />
          ),
        }}
      />
      </Tabs>
    </>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    borderRadius: 36,
    height: 66,
    paddingBottom: 0,
    paddingTop: 0,
    backgroundColor: '#07101F',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(41,182,246,0.07)',
      } as any,
      default: {
        shadowColor: '#29B6F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 20,
      },
    }),
  },
})
