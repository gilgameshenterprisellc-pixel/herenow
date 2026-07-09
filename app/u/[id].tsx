import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import AvatarImage from '@/components/AvatarImage'
import BackButton from '@/components/BackButton'
import { getCircleStatus, sendCircleRequest, respondCircleRequest, type CircleStatus } from '@/lib/circle'

interface UserProfile {
  id: string
  display_name: string
  username: string | null
  avatar_url: string | null
  bio: string | null
  age_range: string | null
  interest_tags: string[] | null
  kickoffs: string[] | null
  created_at: string | null
}

export default function UserProfileScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>()
  const insets  = useSafeAreaInsets()
  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [wemetId, setWemetId]   = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [circleStatus, setCircleStatus] = useState<CircleStatus>('none')
  const [circleReqId, setCircleReqId]   = useState<string | null>(null)
  const [circleBusy, setCircleBusy]     = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: p } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, bio, age_range, interest_tags, kickoffs, created_at')
        .eq('id', id)
        .maybeSingle()

      if (!p) { setNotFound(true); setLoading(false); return }
      setProfile(p as UserProfile)

      // If there's a confirmed We Met between us, expose a Message shortcut
      if (user) {
        const { data: wm } = await supabase
          .from('we_met')
          .select('id')
          .eq('status', 'confirmed')
          .or(`and(initiator_id.eq.${user.id},recipient_id.eq.${id}),and(initiator_id.eq.${id},recipient_id.eq.${user.id})`)
          .maybeSingle()
        setWemetId(wm?.id ?? null)

        // Circle standing (only meaningful once you've met in person)
        if (wm?.id) {
          const cs = await getCircleStatus(id!)
          setCircleStatus(cs.status)
          setCircleReqId(cs.requestId)
        }
      }
      setLoading(false)
    }
    load()
  }, [id])

  const handleCircle = async () => {
    if (!id || circleBusy) return
    setCircleBusy(true)
    if (circleStatus === 'none') {
      const ok = await sendCircleRequest(id)
      if (ok) setCircleStatus('pending_out')
    } else if (circleStatus === 'pending_in' && circleReqId) {
      const ok = await respondCircleRequest(circleReqId, true)
      if (ok) setCircleStatus('in_circle')
    }
    setCircleBusy(false)
  }

  const circleLabel = {
    none:        '🔵 Add to My Circle',
    pending_out: '🔵 Circle request sent',
    pending_in:  '🔵 Add back to your Circle',
    in_circle:   '🔵 In your Circle',
  }[circleStatus]
  const circleDisabled = circleBusy || circleStatus === 'pending_out' || circleStatus === 'in_circle'

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator color="#29B6F6" /></View>
    )
  }

  if (notFound || !profile) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} />
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.center}>
          <Text style={{ fontSize: 36 }}>👤</Text>
          <Text style={[styles.name, { marginTop: 12 }]}>Profile not found</Text>
        </View>
      </View>
    )
  }

  const joined = profile.created_at
    ? `Joined ${new Date(profile.created_at).toLocaleString('default', { month: 'long' })} ${new Date(profile.created_at).getFullYear()}`
    : ''

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} />
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <AvatarImage uri={profile.avatar_url} name={profile.display_name} size={96} />
          <Text style={styles.displayName}>{profile.display_name}</Text>
          {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
          {!!joined && <Text style={styles.joined}>{joined}</Text>}
          {wemetId && (
            <View style={styles.connectedPill}>
              <Text style={styles.connectedText}>🤝 You met in person</Text>
            </View>
          )}
        </View>

        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        {/* Icebreaker — their conversation starter */}
        {profile.kickoffs && profile.kickoffs.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Ask them</Text>
            <Text style={styles.kickoff}>"{profile.kickoffs[0]}"</Text>
          </View>
        )}

        {profile.interest_tags && profile.interest_tags.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Into</Text>
            <View style={styles.tags}>
              {profile.interest_tags.map((t) => (
                <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
              ))}
            </View>
          </View>
        )}

        {wemetId && (
          <TouchableOpacity style={styles.msgBtn} onPress={() => router.push(`/messages/${wemetId}` as any)}>
            <Text style={styles.msgBtnText}>Message</Text>
          </TouchableOpacity>
        )}

        {/* My Circle — deliberate, mutual, only after you've met */}
        {wemetId && (
          <TouchableOpacity
            style={[styles.circleBtn, circleStatus === 'in_circle' && styles.circleBtnActive, circleDisabled && { opacity: 0.7 }]}
            onPress={handleCircle}
            disabled={circleDisabled}
          >
            {circleBusy
              ? <ActivityIndicator color="#29B6F6" size="small" />
              : <Text style={styles.circleBtnText}>{circleLabel}</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  content: { padding: 20, gap: 14 },
  hero: { alignItems: 'center', gap: 6, paddingTop: 8 },
  displayName: { fontSize: 24, fontWeight: '900', color: '#f0f8ff', marginTop: 10 },
  username: { fontSize: 14, color: '#7A93AC' },
  joined: { fontSize: 12, color: '#4A6580' },
  name: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  connectedPill: {
    marginTop: 8, backgroundColor: '#22c55e18', borderColor: '#22c55e44', borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  connectedText: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  bio: { fontSize: 14, color: '#B8D4E8', lineHeight: 20, textAlign: 'center' },
  card: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16, gap: 8,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  cardLabel: { fontSize: 12, fontWeight: '800', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  kickoff: { fontSize: 15, color: '#D0E8F5', fontStyle: 'italic', lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: '#29B6F615', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#29B6F630',
  },
  tagText: { fontSize: 12, color: '#29B6F6', fontWeight: '600' },
  msgBtn: {
    backgroundColor: '#29B6F6', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4,
  },
  msgBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15 },
  circleBtn: {
    borderRadius: 14, padding: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#29B6F6', backgroundColor: '#29B6F612',
  },
  circleBtnActive: { borderColor: '#22c55e55', backgroundColor: '#22c55e14' },
  circleBtnText: { color: '#29B6F6', fontWeight: '800', fontSize: 15 },
})
