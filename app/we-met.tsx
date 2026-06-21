import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useWeMet } from '@/hooks/useWeMet'
import WemetCard from '@/components/WemetCard'

export default function WeMetScreen() {
  const [userId, setUserId]     = useState<string | null>(null)
  const { pending, confirmed, loading, refresh } = useWeMet()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  const allItems = [
    ...pending.map((w) => ({ ...w, _section: 'pending' as const })),
    ...confirmed.map((w) => ({ ...w, _section: 'confirmed' as const })),
  ]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>We Met 🤝</Text>
        {(pending.length + confirmed.length) > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pending.length + confirmed.length}</Text>
          </View>
        )}
      </View>

      {loading || !userId ? (
        <View style={styles.center}>
          <ActivityIndicator color="#29B6F6" />
        </View>
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={refresh}
          refreshing={loading}
          renderItem={({ item, index }) => (
            <>
              {/* Section headers */}
              {item._section === 'pending' && index === 0 && pending.length > 0 && (
                <Text style={styles.sectionLabel}>
                  Pending ({pending.length})
                </Text>
              )}
              {item._section === 'confirmed' && index === pending.length && confirmed.length > 0 && (
                <Text style={[styles.sectionLabel, index > 0 && styles.sectionLabelGap]}>
                  Confirmed ({confirmed.length})
                </Text>
              )}
              <WemetCard
                wemet={item}
                currentUserId={userId}
                onUpdate={refresh}
              />
            </>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🤝</Text>
              <Text style={styles.emptyTitle}>No We Met yet</Text>
              <Text style={styles.emptySub}>
                When you and someone confirm you actually met IRL, they'll show up here.
                It's the only way to unlock DMs.
              </Text>
            </View>
          }
        />
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
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc', flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#29B6F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#050A15' },
  list: { padding: 14, gap: 10 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A93AC',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionLabelGap: { marginTop: 16 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
})
