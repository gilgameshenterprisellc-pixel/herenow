import { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
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
import { reportUser, type ReportReason } from '@/lib/reports'
import { blockUser, fetchBlockedIds } from '@/lib/blocks'
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
  const { activeSession, checkOut } = useSessionContext()
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

  const isCheckedIn = activeSession?.zone_id === id

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data: z } = await supabase
        .from('zones')
        .select('id, name, description, radius_meters, member_count, post_count')
        .eq('id', id)
        .single()
      setZone(z)
      setLoading(false)

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

    const existing = await existingWeMet({ zoneId: id, otherUserId: person.user_id })
    if (existing) {
      Alert.alert(
        'Already sent',
        existing.status === 'confirmed'
          ? 'You\'ve already confirmed you met this person!'
          : existing.status === 'pending'
          ? 'Waiting for them to confirm.'
          : 'This request has expired or was declined.'
      )
      return
    }

    Alert.alert(
      `We Met — ${person.display_name}`,
      'Send a confirmation that you actually met this person IRL?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send We Met',
          onPress: async () => {
            await sendWeMet({
              zoneId: id,
              recipientId: person.user_id,
              initiatorSessionId: activeSession.id,
              recipientSessionId: person.session_id,
            })
            await checkAndAwardBadges('wemet_confirmed')
            Alert.alert('Sent! 🤝', `We Met request sent to ${person.display_name}. They'll confirm when they see it.`)
          },
        },
      ]
    )
  }

  const handleReport = (person: ActivePerson) => {
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

  const submitReport = async (reportedId: string, reason: ReportReason) => {
    await reportUser({ reportedId, zoneId: id, reason })
    Alert.alert('Reported', 'Thank you for keeping the space safe. We\'ll review this.')
  }

  const handleBlock = (person: ActivePerson) => {
    Alert.alert(
      `Block ${person.display_name}?`,
      'They won\'t be able to send you We Met requests, and you won\'t see each other here.',
      [
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            await blockUser(person.user_id)
            setPeople((prev) => prev.filter((p) => p.user_id !== person.user_id))
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    )
  }

  const handlePostPulse = async () => {
    if (!activeSession || (!newPulse.trim() && !vibeTag)) return
    setPostingPulse(true)
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
    setPostingPulse(false)
  }

  const handleSendChat = async () => {
    if (!chatInput.trim() || sendingChat) return
    setSendingChat(true)
    await sendChatMessage({
      zoneId: id,
      content: chatInput.trim(),
      sessionId: activeSession?.id ?? null,
    })
    setChatInput('')
    await checkAndAwardBadges('chat_message')
    await refreshChat()
    setSendingChat(false)
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  const handleCheckOut = () => {
    Alert.alert('Check out', 'Leave this venue and end your session?', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Check Out',
        style: 'destructive',
        onPress: async () => {
          await checkOut()
          router.replace(`/afterglow/${activeSession?.id}`)
        },
      },
    ])
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.zoneName}>{zone?.name}</Text>
          <Text style={styles.zoneMeta}>
            {zone?.radius_meters}m radius
          </Text>
        </View>
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
          <HeatBar count={people.length || activeSession ? 1 : 0} />
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
      {tab === 'people' && (
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

      {tab === 'pulse' && (
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.vibeScroll}
                  contentContainerStyle={styles.vibePills}
                >
                  {VIBE_TAGS.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.vibePill, vibeTag === v && styles.vibePillActive]}
                      onPress={() => setVibeTag(vibeTag === v ? null : v)}
                    >
                      <Text style={styles.vibePillText}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <View style={styles.pulseRow}>
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

      {tab === 'chat' && (
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
            <View style={styles.chatCompose}>
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
  zoneName: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  zoneMeta: { fontSize: 12, color: '#7A93AC', marginTop: 2 },
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
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
  pulseCompose: {
    borderTopWidth: 1,
    borderTopColor: '#0D1B2E',
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
    gap: 0,
  },
  vibeScroll: { maxHeight: 44 },
  vibePills: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row' },
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
    paddingBottom: Platform.OS === 'ios' ? 32 : 10,
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
})
