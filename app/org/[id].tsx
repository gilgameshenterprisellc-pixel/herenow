import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import {
  ORG_CATEGORIES, fetchOrganization, fetchMemberCount, isOrgMember,
  joinOrganization, leaveOrganization, fetchOrgPosts, postOrgAnnouncement,
  fetchOrgEvents,
  type Organization, type OrgPost,
} from '@/lib/organizations'

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

export default function OrganizationScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { showToast } = useToast()

  const [org, setOrg]             = useState<Organization | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [member, setMember]       = useState(false)
  const [isOwner, setIsOwner]     = useState(false)
  const [posts, setPosts]         = useState<OrgPost[]>([])
  const [events, setEvents]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [joining, setJoining]     = useState(false)

  // Owner announcement composer
  const [annTitle, setAnnTitle]   = useState('')
  const [annBody, setAnnBody]     = useState('')
  const [posting, setPosting]     = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null

    const [o, count, m] = await Promise.all([
      fetchOrganization(id),
      fetchMemberCount(id),
      isOrgMember(id),
    ])
    if (!o) { setLoading(false); return }
    setOrg(o)
    setMemberCount(count)
    setMember(m)
    setIsOwner(!!user && o.owner_id === user.id)

    const [p, e] = await Promise.all([fetchOrgPosts(id), fetchOrgEvents(id)])
    setPosts(p)
    setEvents(e)
    setLoading(false)
    setRefreshing(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useFocusEffect(useCallback(() => { if (!loading) load() }, [load]))

  const handleJoinLeave = async () => {
    if (!org) return
    setJoining(true)
    if (member) {
      platformConfirm(
        `Leave ${org.name}?`,
        'You\'ll stop getting announcements from this organization.',
        async () => {
          const ok = await leaveOrganization(org.id)
          setJoining(false)
          if (ok) { showToast('Left the organization.', 'success'); load() }
        },
        { confirmText: 'Leave', destructive: true },
      )
      setJoining(false)
    } else {
      const ok = await joinOrganization(org.id)
      setJoining(false)
      if (!ok) { showToast('Could not join. Try again.', 'error'); return }
      showToast(`Welcome to ${org.name}!`, 'success')
      load()
    }
  }

  const handlePostAnnouncement = async () => {
    if (!org || !annTitle.trim()) return
    setPosting(true)
    const ok = await postOrgAnnouncement(org, annTitle.trim(), annBody.trim() || undefined)
    setPosting(false)
    if (!ok) { showToast('Could not post. Try again.', 'error'); return }
    setAnnTitle('')
    setAnnBody('')
    showToast('Announcement sent to your members.', 'success')
    load()
  }

  const cat = ORG_CATEGORIES.find((c) => c.id === org?.category)
  const upcoming = events.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= Date.now())
  const past     = events.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() <  Date.now())

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{org?.name ?? 'Organization'}</Text>
          {org && (
            <Text style={styles.sub}>
              {cat?.emoji} {cat?.label} · {memberCount} member{memberCount === 1 ? '' : 's'}
            </Text>
          )}
        </View>
        {isOwner && (
          <TouchableOpacity onPress={() => router.push(`/org/new?orgId=${id}` as any)} hitSlop={8}>
            <Ionicons name="create-outline" size={20} color="#7A93AC" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : !org ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Organization not found</Text>
        </View>
      ) : (
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
          {/* About */}
          {!!org.description && <Text style={styles.description}>{org.description}</Text>}
          {org.zones && (
            <TouchableOpacity style={styles.venueLink} onPress={() => router.push(`/zone/${org.zones!.id}` as any)}>
              <Ionicons name="location-outline" size={15} color="#29B6F6" />
              <Text style={styles.venueLinkText}>Meets at {org.zones.name}</Text>
            </TouchableOpacity>
          )}

          {/* Join / owner strip */}
          {isOwner ? (
            <View style={styles.ownerStrip}>
              <Text style={styles.ownerStripText}>You run this organization</Text>
              <View style={styles.ownerStats}>
                <View style={styles.ownerStat}>
                  <Text style={styles.ownerStatNum}>{memberCount}</Text>
                  <Text style={styles.ownerStatLabel}>Members</Text>
                </View>
                <View style={styles.ownerStat}>
                  <Text style={styles.ownerStatNum}>{events.reduce((s, e) => s + (e.rsvp_count ?? 0), 0)}</Text>
                  <Text style={styles.ownerStatLabel}>Event RSVPs</Text>
                </View>
                <View style={styles.ownerStat}>
                  <Text style={styles.ownerStatNum}>{posts.length}</Text>
                  <Text style={styles.ownerStatLabel}>Announcements</Text>
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.joinBtn, member && styles.joinBtnMember]}
              onPress={handleJoinLeave}
              disabled={joining}
              activeOpacity={0.85}
            >
              {joining
                ? <ActivityIndicator color={member ? '#7A93AC' : '#050A15'} size="small" />
                : <Text style={[styles.joinBtnText, member && styles.joinBtnTextMember]}>
                    {member ? '✓ Member — tap to leave' : 'Join'}
                  </Text>}
            </TouchableOpacity>
          )}

          {/* Owner tools */}
          {isOwner && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Post an announcement</Text>
              <Text style={styles.sectionHint}>Goes to all {memberCount} members as a notification.</Text>
              <TextInput
                style={styles.input}
                value={annTitle}
                onChangeText={setAnnTitle}
                placeholder="Tournament this Thursday, 7pm"
                placeholderTextColor="#4A6580"
                maxLength={100}
              />
              <TextInput
                style={[styles.input, styles.multiline]}
                value={annBody}
                onChangeText={setAnnBody}
                placeholder="Details (optional)"
                placeholderTextColor="#4A6580"
                multiline
                maxLength={500}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.postBtn, (!annTitle.trim() || posting) && { opacity: 0.4 }]}
                  onPress={handlePostAnnouncement}
                  disabled={!annTitle.trim() || posting}
                >
                  {posting ? <ActivityIndicator color="#050A15" size="small" /> : <Text style={styles.postBtnText}>Send to Members</Text>}
                </TouchableOpacity>
                {org.host_zone_id && (
                  <TouchableOpacity
                    style={styles.eventBtn}
                    onPress={() => router.push(`/zone/event/create?zoneId=${org.host_zone_id}&orgId=${org.id}` as any)}
                  >
                    <Text style={styles.eventBtnText}>＋ Event</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Announcements */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Announcements</Text>
            {!member && !isOwner ? (
              <Text style={styles.lockedText}>Join to see announcements from this organization.</Text>
            ) : posts.length === 0 ? (
              <Text style={styles.lockedText}>Nothing posted yet.</Text>
            ) : (
              posts.map((p) => (
                <View key={p.id} style={styles.postCard}>
                  <Text style={styles.postTitle}>{p.title}</Text>
                  {!!p.body && <Text style={styles.postBody}>{p.body}</Text>}
                  <Text style={styles.postTime}>{timeAgo(p.created_at)}</Text>
                </View>
              ))
            )}
          </View>

          {/* Events */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Events</Text>
            {events.length === 0 ? (
              <Text style={styles.lockedText}>No events yet.</Text>
            ) : (
              <>
                {upcoming.map((e) => (
                  <TouchableOpacity key={e.id} style={styles.eventCard} onPress={() => e.zone_id && router.push(`/zone/${e.zone_id}` as any)}>
                    <Text style={styles.eventTitle}>{e.title}</Text>
                    <Text style={styles.eventWhen}>
                      {new Date(e.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {'  ·  '}{e.rsvp_count ?? 0} RSVP{(e.rsvp_count ?? 0) === 1 ? '' : 's'}
                    </Text>
                  </TouchableOpacity>
                ))}
                {past.length > 0 && upcoming.length > 0 && <Text style={styles.pastLabel}>PAST</Text>}
                {past.slice(0, 5).map((e) => (
                  <View key={e.id} style={[styles.eventCard, { opacity: 0.5 }]}>
                    <Text style={styles.eventTitle}>{e.title}</Text>
                    <Text style={styles.eventWhen}>
                      {new Date(e.starts_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      {'  ·  '}{e.rsvp_count ?? 0} RSVP{(e.rsvp_count ?? 0) === 1 ? '' : 's'}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      )}
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
  title: { fontSize: 19, fontWeight: '800', color: '#f8fafc' },
  sub: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 60 },

  description: { fontSize: 14, color: '#B8D4E8', lineHeight: 21 },
  venueLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueLinkText: { fontSize: 13, color: '#29B6F6', fontWeight: '600' },

  joinBtn: { backgroundColor: '#29B6F6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  joinBtnMember: { backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A' },
  joinBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15 },
  joinBtnTextMember: { color: '#7A93AC', fontWeight: '600' },

  ownerStrip: {
    backgroundColor: '#0B1828', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 10,
  },
  ownerStripText: { fontSize: 12, fontWeight: '700', color: '#C9940C' },
  ownerStats: { flexDirection: 'row', gap: 10 },
  ownerStat: { flex: 1, alignItems: 'center', gap: 2 },
  ownerStatNum: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  ownerStatLabel: { fontSize: 11, color: '#7A93AC' },

  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  sectionHint: { fontSize: 12, color: '#4A6580', marginTop: -6 },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  postBtn: {
    backgroundColor: '#29B6F6', borderRadius: 10, paddingHorizontal: 16,
    paddingVertical: 11, alignItems: 'center', flex: 1,
  },
  postBtnText: { color: '#050A15', fontWeight: '800', fontSize: 13 },
  eventBtn: {
    borderWidth: 1, borderColor: '#29B6F6', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center',
  },
  eventBtnText: { color: '#29B6F6', fontWeight: '800', fontSize: 13 },

  lockedText: { fontSize: 13, color: '#4A6580', fontStyle: 'italic' },
  postCard: {
    backgroundColor: '#0B1828', borderRadius: 12, padding: 13,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 4,
  },
  postTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  postBody: { fontSize: 13, color: '#B8D4E8', lineHeight: 18 },
  postTime: { fontSize: 11, color: '#4A6580', marginTop: 2 },

  eventCard: {
    backgroundColor: '#0B1828', borderRadius: 12, padding: 13,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 3,
  },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  eventWhen: { fontSize: 12, color: '#29B6F6', fontWeight: '600' },
  pastLabel: { fontSize: 11, fontWeight: '800', color: '#3A5570', letterSpacing: 1, marginTop: 4 },
})
