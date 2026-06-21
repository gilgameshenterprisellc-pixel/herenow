import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { getUnreadCount } from '@/lib/notifications'
import { supabase } from '@/lib/supabase'
import OnboardingModal from '@/components/OnboardingModal'

// supabase is kept for the realtime notification subscription

function TabIcon({ emoji, label, focused, badge }: {
  emoji: string; label: string; focused: boolean; badge?: number
}) {
  return (
    <View style={styles.tabItem}>
      <View style={styles.emojiWrap}>
        <Text style={[styles.emoji, focused && styles.emojiFocused]}>{emoji}</Text>
        {badge && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
    </View>
  )
}

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
    backgroundColor: '#050A15',
    borderTopColor: '#0D1B2E',
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 16,
    paddingTop: 8,
  },
  tabItem: { alignItems: 'center', gap: 2 },
  emojiWrap: { position: 'relative' },
  emoji: { fontSize: 22, opacity: 0.5 },
  emojiFocused: { opacity: 1 },
  label: { fontSize: 10, color: '#7A93AC' },
  labelFocused: { color: '#29B6F6' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#29B6F6',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#050A15',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#050A15' },
})
