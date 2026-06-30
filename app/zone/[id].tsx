import { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionContext } from '@/contexts/SessionContext'
import { getActivePeople } from '@/lib/sessions'
import type { ActivePerson } from '@/lib/sessions'
import { usePulse } from '@/hooks/usePulse'
import { useVenueChat } from '@/hooks/useVenueChat'
import { createPulsePost, VIBE_TAGS } from '@/lib/pulse'
import { sendChatMessage } from '@/lib/chat'
import { sendWeMet, existingWeMet } from '@/lib/weMet'
import { fetchEvents, toggleRsvp } from '@/lib/events'
import { checkAndAwardBadges } from '@/lib/badges'
import { reportUser, reportContent, type ReportReason, type ContentReportReason } from '@/lib/reports'
import { blockUser, fetchBlockedIds } from '@/lib/blocks'
import { fetchHighlights, type VenueHighlight } from '@/lib/highlights'
import { subscribeToVenue, unsubscribeFromVenue, isSubscribedToVenue } from '@/lib/venueSubscriptions'
import PersonCard from '@/components/PersonCard'
import PulsePostCard from '@/components/PulsePostCard'
import ChatMessage from '@/components/ChatMessage'
import EventCard from '@/components/EventCard'
import HeatBar from '@/components/HeatBar'
import type { VenueEvent } from '@/lib/events'

type Tab = 'people' | 'pulse' | 'chat' | 'events'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'people', label: 'People',  emoji: '👥' },
  { id: 'pulse',  label: 'Pulse',   emoji: '✨' },
  { id: 'chat',   label: 'Chat',    emoji: '💬' },
  { id: 'events', label: 'Events',  emoji: '📅' },
]

export default function ZoneScreen() {
  const { id }                     = useLocalSearchParams<{ id: string }>()
  const insets                     = useSafeAreaInsets()
  const { activeSession, checkOut } = useSessionContext()
  const { showToast }              = useToast()
  const [userId, setUserId]         = useState<string | null>(null)
  const [zone, setZone]             = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<Tab>('people')

  // People
  const [people, setPeople]           = useState<ActivePerson[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)

  // Pulse
  const { posts: pulsePosts, refresh: refreshPulse } = usePulse(id)
  const [newPulse, setNewPulse]   = useState('')
  const [vibeTag, setVibeTag]     = useState<string | null>(null)
  const [postingPulse, setPostingPulse] = useState(false)
  const [showVibePicker, setShowVibePicker] = useState(false)

  // Chat
  const { messages: chatMsgs, refresh: refreshChat } = useVenueChat(id)
  const [chatInput, setChatInput] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const chatListRef = useRef<FlatList>(null)

  // Events
  const [events, setEvents]         = useState<VenueEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  // Highlights
  const [highlights, setHighlights] = useState<VenueHighlight[]>([])

  // Gallery
  const [photos, setPhotos] = useState<{ id: string; public_url: string; caption: string | null }[]>([])

  // Subscription
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subLoading, setSubLoading]     = useState(false)

  const isCheckedIn = activeSession?.zone_id === id

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data: z } = await supabase
        .from('zones')
        .select('id, name, description, radius_meters, member_count, post_count, center_lat, center_lng, opening_hours, chips')
        .eq('id', id)
        .maybeSingle()

      if (!z) {
        setLoading(false)
        return
      }
      setZone(z)
      setLoading(false)

      // Load highlights (visible to all)
      const hl = await fetchHighlights(id)
      setHighlights(hl)

      // Load gallery photos (visible to all)
      const { data: photoData } = await supabase
        .from('venue_photos')
        .select('id, public_url, caption')
        .eq('zone_id', id)
        .order('created_at', { ascending: false })
        .limit(20)
      setPhotos(photoData ?? [])

      // Check subscription state
      if (user) {
        const subbed = await isSubscribedToVenue(id)
        setIsSubscribed(subbed)
      }

      // Join as member if not already
      if (user) {
        await supabase
          .from('zone_members')
          .upsert({ zone_id: id, user_id: user.id, is_present: false }, { onConflict: 'zone_id,user_id' })
      }
    }
    init()
  }, [id])

  useEffect(() => {
    if (tab === 'people') loadPeople()
    if (tab === 'events') loadEvents()
  }, [tab, id])

  const loadPeople = async () => {
    setPeopleLoading(true)
    const [data, blockedIds] = await Promise.all([
      getActivePeople(id),
      fetchBlockedIds(),
    ])
    const blockedSet = new Set(blockedIds)
    setPeople(data.filter((p) => !blockedSet.has(p.user_id)))
    setPeopleLoading(false)
  }

  const loadEvents = async () => {
    setEventsLoading(true)
    const data = await fetchEvents(id)
    setEvents(data)
    setEventsLoading(false)
  }

  const handleWeMet = async (person: ActivePerson) => {
    if (!userId || !isCheckedIn || !activeSession) return
    try {
      const existing = await existingWeMet({ zoneId: id, otherUserId: person.user_id })
      if (existing) {
        showToast(
          existing.status === 'confirmed'
            ? 'Already confirmed — you met this person!'
            : existing.status === 'pending'
            ? 'Request sent — waiting for them to confirm.'
            : 'This request expired or was declined.',
          existing.status === 'confirmed' ? 'success' : 'info'
        )
        return
      }

      platformConfirm(
        `We Met — ${person.display_name}`,
        'Send a confirmation that you actually met this person IRL?',
        async () => {
          try {
            await sendWeMet({
              zoneId: id,
              recipientId: person.user_id,
              initiatorSessionId: activeSession.id,
              recipientSessionId: person.session_id,
            })
            await checkAndAwardBadges('wemet_confirmed')
            showToast(`We Met request sent to ${person.display_name}!`, 'success')
          } catch {
            showToast('Could not send We Met. Try again.', 'error')
          }
        },
        { confirmText: 'Send We Met' }
      )
    } catch {
      showToast('Something went wrong. Try again.', 'error')
    }
  }

  const handleReport = (person: ActivePerson) => {
    if (Platform.OS === 'web') {
      if ((window as any).confirm(`Report ${person.display_name} for inappropriate behavior?`)) {
        submitReport(person.user_id, 'inappropriate_behavior')
      }
    } else {
      Alert.alert(
        `Report ${person.display_name}`,
        'What is this report about?',
        [
          { text: 'Harassment', onPress: () => submitReport(person.user_id, 'harassment') },
          { text: 'Inappropriate behavior', onPress: () => submitReport(person.user_id, 'inappropriate_behavior') },
          { text: 'Spam', onPress: () => submitReport(person.user_id, 'spam') },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
    }
  }

  const submitReport = async (reportedId: string, reason: ReportReason) => {
    try {
      await reportUser({ reportedId, zoneId: id, reason })
      showToast('Reported. Thank you for keeping the space safe.', 'success')
    } catch {
      showToast('Could not submit report. Try again.', 'error')
    }
  }

  const handleBlock = (person: ActivePerson) => {
    platformConfirm(
      `Block ${person.display_name}?`,
      'They won\'t be able to send you We Met requests, and you won\'t see each other here.',
      async () => {
        try {
          await blockUser(person.user_id)
          setPeople((prev) => prev.filter((p) => p.user_id !== person.user_id))
        } catch {
          showToast('Could not block user. Try again.', 'error')
        }
      },
      { confirmText: 'Block', destructive: true }
    )
  }

  const handlePostPulse = async () => {
    if (!activeSession || (!newPulse.trim() && !vibeTag)) return
    setPostingPulse(true)
    try {
      await createPulsePost({
        zoneId: id,
        sessionId: activeSession.id,
        content: newPulse.trim() || undefined,
        vibeTag: vibeTag ?? undefined,
      })
      setNewPulse('')
      setVibeTag(null)
      setShowVibePicker(false)
      await checkAndAwardBadges('pulse_post')
      await refreshPulse()
    } catch {
      showToast('Could not post. Try again.', 'error')
    } finally {
      setPostingPulse(false)
    }
  }

  const handleSendChat = async () => {
    if (!chatInput.trim() || sendingChat) return
    setSendingChat(true)
    try {
      await sendChatMessage({
        zoneId: id,
        content: chatInput.trim(),
        sessionId: activeSession?.id ?? null,
      })
      setChatInput('')
      await checkAndAwardBadges('chat_message')
      await refreshChat()
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100)
    } catch {
      showToast('Could not send message. Try again.', 'error')
    } finally {
      setSendingChat(false)
    }
  }

  const handleReportPost = (postId: string) => {
    if (Platform.OS === 'web') {
      if ((window as any).confirm('Report this post as spam or inappropriate?')) {
        submitContentReport(postId, 'spam')
      }
    } else {
      Alert.alert(
        'Report this post',
        'What\'s wrong with it?',
        [
          { text: 'Spam', onPress: () => submitContentReport(postId, 'spam') },
          { text: 'Harassment', onPress: () => submitContentReport(postId, 'harassment') },
          { text: 'Inappropriate', onPress: () => submitContentReport(postId, 'inappropriate') },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
    }
  }

  const submitContentReport = async (postId: string, reason: ContentReportReason) => {
    try {
      await reportContent({ contentType: 'pulse_post', contentId: postId, zoneId: id, reason })
      showToast('Reported. Thanks for keeping the space safe.', 'success')
    } catch {
      showToast('Could not submit report. Try again.', 'error')
    }
  }

  const handleSubscribeToggle = async () => {
    setSubLoading(true)
    try {
      if (isSubscribed) {
        await unsubscribeFromVenue(id)
        setIsSubscribed(false)
      } else {
        await subscribeToVenue(id)
        setIsSubscribed(true)
        showToast(`Following ${zone?.name ?? 'this venue'}! You'll see their updates in your feed.`, 'success')
      }
    } catch {
      showToast('Could not update follow status. Try again.', 'error')
    } finally {
      setSubLoading(false)
    }
  }

  const handleCheckOut = () => {
    platformConfirm(
      'Check out',
      'Leave this venue and end your session?',
      async () => {
        try {
          await checkOut()
          router.replace(`/afterglow/${activeSession?.id}`)
        } catch {
          showToast('Could not check out. Try again.', 'error')
        }
      },
      { confirmText: 'Check Out', cancelText: 'Stay', destructive: true }
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.zoneName}>{zone?.name}</Text>
          <Text style={styles.zoneMeta}>
            {zone?.opening_hours ?? `${zone?.radius_meters}m radius`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.subBtn, isSubscribed && styles.subBtnActive]}
          onPress={handleSubscribeToggle}
          disabled={subLoading}
        >
          <Text style={[styles.subBtnText, isSubscribed && styles.subBtnTextActive]}>
            {subLoading ? '…' : isSubscribed ? '🔔' : '+ Follow'}
          </Text>
        </TouchableOpacity>

        {isCheckedIn ? (
          <TouchableOpacity style={styles.checkOutBtn} onPress={handleCheckOut}>
            <Text style={styles.checkOutText}>Leave</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.checkInBtn}
            onPress={() => router.push(`/check-in/${id}`)}
          >
            <Text style={styles.checkInText}>Check In</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Heat bar — only when checked in */}
      {isCheckedIn && (
        <View style={styles.heatBarWrap}>
          <HeatBar count={people.length + (activeSession ? 1 : 0)} />
        </View>
      )}

      {/* Venue Highlights — visible to all */}
      {highlights.length > 0 && (
        <View style={styles.highlightsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.highlightsList}
          >
            {highlights.map((h) => (
              <View key={h.id} style={styles.highlightCard}>
                <Text style={styles.highlightEmoji}>{h.emoji ?? '⭐'}</Text>
                <Text style={styles.highlightTitle} numberOfLines={1}>{h.title}</Text>
                {h.body ? <Text style={styles.highlightBody} numberOfLines={2}>{h.body}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Gallery photo strip — visible to all */}
      {photos.length > 0 && (
        <View style={styles.galleryWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryList}
          >
            {photos.map((p) => (
              <View key={p.id} style={styles.galleryThumb}>
                <Image
                  source={{ uri: p.public_url }}
                  style={styles.galleryImg}
                  resizeMode="cover"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabItem, tab === t.id && styles.tabItemActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={styles.tabEmoji}>{t.emoji}</Text>
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}

      {/* Gate: People / Pulse / Chat require physical check-in */}
      {(tab === 'people' || tab === 'pulse' || tab === 'chat') && !isCheckedIn && (
        <View style={styles.gateWall}>
          <Text style={styles.gateEmoji}>📍</Text>
          <Text style={styles.gateTitle}>Check in to join</Text>
          <Text style={styles.gateSub}>
            {tab === 'people'
              ? "You can only see who's here once you're actually here."
              : tab === 'pulse'
              ? 'The Pulse is only visible to people in the venue.'
              : 'Live Chat is only open to people currently checked in.'}
          </Text>
          <TouchableOpacity
            style={styles.gateBtn}
            onPress={() => router.push(`/check-in/${id}`)}
          >
            <Text style={styles.gateBtnText}>Check In →</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'people' && isCheckedIn && (
        <FlatList
          data={people}
          keyExtractor={(p) => p.session_id}
          contentContainerStyle={styles.list}
          onRefresh={loadPeople}
          refreshing={peopleLoading}
          renderItem={({ item }) => (
            <PersonCard
              person={item}
              currentUserId={userId ?? ''}
              zoneId={id}
              currentSessionId={activeSession?.id}
              onWeMet={isCheckedIn ? handleWeMet : undefined}
              onReport={handleReport}
              onBlock={handleBlock}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>No one here yet</Text>
              <Text style={styles.emptySub}>
                {isCheckedIn
                  ? 'You\'re the first one. Hold down the vibe.'
                  : 'Check in to see who\'s here.'}
              </Text>
            </View>
          }
        />
      )}

      {tab === 'pulse' && isCheckedIn && (
        <View style={styles.flex}>
          <FlatList
            data={pulsePosts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <PulsePostCard
                post={item}
                currentUserId={userId ?? ''}
                onDeleted={refreshPulse}
                onReport={handleReportPost}
              />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>✨</Text>
                <Text style={styles.emptyTitle}>No Pulse moments yet</Text>
                <Text style={styles.emptySub}>
                  {isCheckedIn ? 'Drop the first vibe.' : 'Check in to post.'}
                </Text>
              </View>
            }
          />

          {isCheckedIn && (
            <View style={styles.pulseCompose}>
              {showVibePicker && (
                <View style={styles.vibePillsWrap}>
                  {VIBE_TAGS.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.vibePill, vibeTag === v && styles.vibePillActive]}
                      onPress={() => setVibeTag(vibeTag === v ? null : v)}
                    >
                      <Text style={styles.vibePillText}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={[styles.pulseRow, { paddingBottom: insets.bottom + 10 }]}>
                <TouchableOpacity
                  style={styles.vibeToggle}
                  onPress={() => setShowVibePicker(!showVibePicker)}
                >
                  <Text style={styles.vibeToggleText}>{vibeTag ? '🏷️' : '✨'}</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.pulseInput}
                  placeholder="What's the vibe?"
                  placeholderTextColor="#4A6580"
                  value={newPulse}
                  onChangeText={setNewPulse}
                  maxLength={280}
                />
                <TouchableOpacity
                  style={[styles.postBtn, (!newPulse.trim() && !vibeTag) && styles.postBtnDisabled]}
                  onPress={handlePostPulse}
                  disabled={postingPulse || (!newPulse.trim() && !vibeTag)}
                >
                  {postingPulse
                    ? <ActivityIndicator color="#050A15" size="small" />
                    : <Text style={styles.postBtnText}>Post</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {tab === 'chat' && isCheckedIn && (
        <View style={styles.flex}>
          <FlatList
            ref={chatListRef}
            data={chatMsgs}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[styles.list, { paddingBottom: 8 }]}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <ChatMessage message={item} currentUserId={userId ?? ''} />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyTitle}>Chat is quiet</Text>
                <Text style={styles.emptySub}>
                  {isCheckedIn ? 'Say something to break the ice.' : 'Check in to join the chat.'}
                </Text>
              </View>
            }
          />

          {isCheckedIn && (
            <View style={[styles.chatCompose, { paddingBottom: insets.bottom + 10 }]}>
              <TextInput
                style={styles.chatInput}
                placeholder="Say something..."
                placeholderTextColor="#4A6580"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleSendChat}
                returnKeyType="send"
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!chatInput.trim() || sendingChat) && styles.sendBtnDisabled]}
                onPress={handleSendChat}
                disabled={!chatInput.trim() || sendingChat}
              >
                {sendingChat
                  ? <ActivityIndicator color="#050A15" size="small" />
                  : <Text style={styles.sendBtnText}>↑</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {tab === 'events' && (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          onRefresh={loadEvents}
          refreshing={eventsLoading}
          ListHeaderComponent={
            isCheckedIn ? (
              <TouchableOpacity
                style={styles.createEventBtn}
                onPress={() => router.push(`/zone/event/create?zoneId=${id}`)}
              >
                <Text style={styles.createEventText}>+ Create Event</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onToggleRsvp={(event) => {
                toggleRsvp(event.id, !!event.user_rsvpd).then(loadEvents)
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptySub}>
                {isCheckedIn ? 'Create an event for this venue.' : 'Check in to create events.'}
              </Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  flex:      { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  headerInfo: { flex: 1 },
  zoneName: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  zoneMeta: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  subBtn: {
    borderWidth: 1,
    borderColor: '#29B6F6',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  subBtnActive: { backgroundColor: '#29B6F618' },
  subBtnText: { color: '#29B6F6', fontWeight: '700', fontSize: 12 },
  subBtnTextActive: { color: '#29B6F6' },
  checkInBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  checkInText: { color: '#050A15', fontWeight: '700', fontSize: 13 },
  checkOutBtn: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  checkOutText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  heatBarWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    backgroundColor: '#050A15',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: '#29B6F6' },
  tabEmoji: { fontSize: 16 },
  tabLabel: { fontSize: 11, color: '#7A93AC', fontWeight: '600' },
  tabLabelActive: { color: '#29B6F6' },
  list: { padding: 14, gap: 10 },
  gateWall: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12,
  },
  gateEmoji:   { fontSize: 44 },
  gateTitle:   { fontSize: 18, fontWeight: '800', color: '#f8fafc', textAlign: 'center' },
  gateSub:     { fontSize: 14, color: '#7A93AC', textAlign: 'center', lineHeight: 20 },
  gateBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 14, marginTop: 8,
  },
  gateBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
  pulseCompose: {
    borderTopWidth: 1,
    borderTopColor: '#0D1B2E',
    gap: 0,
  },
  vibePillsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  vibePill: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  vibePillActive: { backgroundColor: '#a855f718', borderColor: '#a855f7' },
  vibePillText: { fontSize: 12, color: '#8EADC7' },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  vibeToggle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0D1B2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  vibeToggleText: { fontSize: 18 },
  pulseInput: {
    flex: 1,
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    padding: 10,
    color: '#f8fafc',
    fontSize: 14,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  postBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 55,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { color: '#050A15', fontWeight: '700', fontSize: 14 },
  chatCompose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#0D1B2E',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#29B6F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 18, fontWeight: '800', color: '#050A15' },
  createEventBtn: {
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  createEventText: { color: '#29B6F6', fontWeight: '700', fontSize: 14 },
  highlightsWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    paddingVertical: 10,
  },
  highlightsList: { paddingHorizontal: 14, gap: 10, flexDirection: 'row' },
  highlightCard: {
    backgroundColor: '#0D1B2E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    width: 150,
    gap: 4,
  },
  highlightEmoji: { fontSize: 20 },
  highlightTitle: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  highlightBody:  { fontSize: 12, color: '#8EADC7', lineHeight: 16 },
  galleryWrap:  { borderBottomWidth: 1, borderBottomColor: '#0D1B2E', paddingVertical: 10 },
  galleryList:  { paddingHorizontal: 14, gap: 8, flexDirection: 'row' },
  galleryThumb: { borderRadius: 10, overflow: 'hidden' },
  galleryImg:   { width: 90, height: 90, borderRadius: 10 },
})
