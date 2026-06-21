import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { fetchAllBadges, fetchUserBadges } from '@/lib/badges'
import BadgeCard from '@/components/BadgeCard'
import type { Badge } from '@/lib/badges'

const CATEGORY_ORDER = ['courage', 'kindness', 'exploration', 'connection', 'presence']
const CATEGORY_LABEL: Record<string, string> = {
  courage:     '⚡ Courage',
  kindness:    '💚 Kindness',
  exploration: '🧭 Exploration',
  connection:  '🔗 Connection',
  presence:    '🌟 Presence',
}

export default function BadgesScreen() {
  const [allBadges, setAllBadges]   = useState<Badge[]>([])
  const [earnedMap, setEarnedMap]   = useState<Map<string, string>>() // badge_id → earned_at
  const [loading, setLoading]       = useState(true)
  const [earnedCount, setEarnedCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [all, earned] = await Promise.all([
        fetchAllBadges(),
        fetchUserBadges(user.id),
      ])

      const map = new Map<string, string>()
      earned.forEach((ub) => map.set(ub.badge_id, ub.earned_at))

      setAllBadges(all)
      setEarnedMap(map)
      setEarnedCount(earned.length)
      setLoading(false)
    }
    load()
  }, [])

  // Group by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    badges: allBadges.filter((b) => b.category === cat),
  })).filter((g) => g.badges.length > 0)

  const items: Array<{ type: 'header'; category: string } | { type: 'badge'; badge: Badge }> = []
  grouped.forEach((g) => {
    items.push({ type: 'header', category: g.category })
    g.badges.forEach((b) => items.push({ type: 'badge', badge: b }))
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Badges 🏅</Text>
          {!loading && (
            <Text style={styles.subtitle}>
              {earnedCount} / {allBadges.length} earned
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#29B6F6" />
        </View>
      ) : (
        <>
          {/* Progress bar */}
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round((earnedCount / Math.max(allBadges.length, 1)) * 100)}%` as any },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {Math.round((earnedCount / Math.max(allBadges.length, 1)) * 100)}% complete
            </Text>
          </View>

          <FlatList
            data={items}
            keyExtractor={(item, idx) =>
              item.type === 'header' ? `h-${item.category}` : `b-${item.badge.id}`
            }
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <Text style={styles.catLabel}>{CATEGORY_LABEL[item.category]}</Text>
                )
              }
              const earned = earnedMap?.has(item.badge.id) ?? false
              const earnedAt = earnedMap?.get(item.badge.id)
              return (
                <BadgeCard
                  badge={item.badge}
                  earned={earned}
                  earnedAt={earnedAt}
                />
              )
            }}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  headerInfo: { flex: 1 },
  title: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
  subtitle: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  progressWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#0D1B2E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#29B6F6',
    borderRadius: 3,
    minWidth: 4,
  },
  progressLabel: { fontSize: 11, color: '#7A93AC', textAlign: 'right' },
  list: { padding: 14, gap: 8 },
  catLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A93AC',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
})
