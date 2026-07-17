import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import BackButton from '@/components/BackButton'
import { ORG_CATEGORIES, fetchMyOrganizations, type Organization } from '@/lib/organizations'

// "Organizations" — the clubs/leagues/communities you run or belong to.
export default function MyOrganizationsScreen() {
  const insets = useSafeAreaInsets()
  const [owned, setOwned]   = useState<Organization[]>([])
  const [joined, setJoined] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { owned, joined } = await fetchMyOrganizations()
    setOwned(owned)
    setJoined(joined)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const orgRow = (org: Organization) => {
    const cat = ORG_CATEGORIES.find((c) => c.id === org.category)
    return (
      <TouchableOpacity
        key={org.id}
        style={styles.card}
        onPress={() => router.push(`/org/${org.id}` as any)}
        activeOpacity={0.8}
      >
        <Text style={styles.cardEmoji}>{cat?.emoji ?? '📍'}</Text>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{org.name}</Text>
          <Text style={styles.cardMeta}>
            {cat?.label}{org.zones ? ` · ${org.zones.name}` : ''}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} />
        <Text style={styles.title}>Organizations</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/org/new' as any)}>
          <Text style={styles.createBtnText}>＋ Register an Organization</Text>
        </TouchableOpacity>
        <Text style={styles.createHint}>
          Run a club, league, brand, or community at a venue — promote to your members and see your numbers.
        </Text>

        {loading ? (
          <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            {owned.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>YOU RUN</Text>
                {owned.map(orgRow)}
              </>
            )}
            {joined.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>MEMBER OF</Text>
                {joined.map(orgRow)}
              </>
            )}
            {owned.length === 0 && joined.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🎲</Text>
                <Text style={styles.emptyTitle}>No organizations yet</Text>
                <Text style={styles.emptySub}>
                  Join one from a venue page, or register your own crew above.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 60 },
  createBtn: {
    borderWidth: 1, borderColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  createBtnText: { color: '#29B6F6', fontWeight: '800', fontSize: 15 },
  createHint: { fontSize: 12, color: '#4A6580', textAlign: 'center', lineHeight: 17, marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#3A5570', letterSpacing: 1, marginTop: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0B1828', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  cardEmoji: { fontSize: 24 },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  cardMeta: { fontSize: 12, color: '#7A93AC' },
  chevron: { fontSize: 22, color: '#4A6580' },
  empty: { alignItems: 'center', marginTop: 50, gap: 8, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 19 },
})
