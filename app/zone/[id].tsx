import { useState, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
  ActionSheetIOS, Animated, Modal,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionContext } from '@/contexts/SessionContext'
import { getActivePeople, updateSessionModes, allSocialModes } from '@/lib/sessions'
import BackButton from '@/components/BackButton'
import type { ActivePerson, SocialMode, MoodMode } from '@/lib/sessions'
import SocialModeBadge from '@/components/SocialModeBadge'
import MoodBadge from '@/components/MoodBadge'
import { usePulse } from '@/hooks/usePulse'
import { useVenueChat } from '@/hooks/useVenueChat'
import { createPulsePost, VIBE_TAGS } from '@/lib/pulse'
import { screenImage } from '@/lib/moderation'
import { screenText, blockedMessage } from '@/lib/textModeration'
import { sendChatMessage } from '@/lib/chat'
import { sendWeMet, existingWeMet } from '@/lib/weMet'
import { fetchEvents, toggleRsvp } from '@/lib/events'
import { checkAndAwardBadges } from '@/lib/badges'
import { reportUser, reportContent, type ReportReason, type ContentReportReason } from '@/lib/reports'
import { blockUser, fetchBlockedIds } from '@/lib/blocks'
import { fetchHighlights, type VenueHighlight } from '@/lib/highlights'
import { successBuzz } from '@/lib/haptics'
import { fetchVenueBadges, checkAndAwardVenueBadges, type VenueBadge } from '@/lib/venueBadges'
import { followVenue, unfollowVenue, isFollowingVenue, subscribeAsPatron, isSubscriberOfVenue } from '@/lib/venueSubscriptions'
import PersonCard from '@/components/PersonCard'
import PulsePostCard from '@/components/PulsePostCard'
import ChatMessage from '@/components/ChatMessage'
import EventCard from '@/components/EventCard'
import HeatBar from '@/components/HeatBar'
import type { VenueEvent } from '@/lib/events'

type Tab = 'people' | 'pulse' | 'chat' | 'events'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pulse',  label: 'Pulse'  },
  { id: 'chat',   label: 'Chat'   },
  { id: 'people', label: 'People' },
  { id: 'events', label: 'Events' },
]

const VIBE_SOCIAL_OPTIONS: { mode: SocialMode; label: string; color: string }[] = [
  { mode: 'dating',     label: 'Dating',     color: '#f43f5e' },
  { mode: 'friends',    label: 'Friends',    color: '#22c55e' },
  { mode: 'networking', label: 'Networking', color: '#3b82f6' },
  { mode: 'just_vibes', label: 'Just Vibes', color: '#a855f7' },
]

const VIBE_MOOD_OPTIONS: { mode: MoodMode; label: string; color: string }[] = [
  { mode: 'open',      label: 'Open',      color: '#22c55e' },
  { mode: 'selective', label: 'Selective', color: '#29B6F6' },
  { mode: 'not_today', label: 'Not Today', color: '#7A93AC' },
]

export default function ZoneScreen() {
  const { id }                     = useLocalSearchParams<{ id: string }>()
  const insets                     = useSafeAreaInsets()
  const { activeSession, checkOut, refresh } = useSessionContext()
  const { showToast }              = useToast()
  const [userId, setUserId]         = useState<string | null>(null)
  const [zone, setZone]             = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<Tab>('pulse')

  // People
  const [people, setPeople]           = useState<ActivePerson[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)

  // Mid-session vibe editor
  const [vibeEditOpen, setVibeEditOpen] = useState(false)
  const [editSocials, setEditSocials]   = useState<SocialMode[]>(['just_vibes'])
  const [editMood, setEditMood]         = useState<MoodMode>('selective')
  const [vibeSaving, setVibeSaving]     = useState(false)

  // Pulse
  const { posts: pulsePosts, refresh: refreshPulse } = usePulse(id)
  const [newPulse, setNewPulse]   = useState('')
  const [vibeTag, setVibeTag]     = useState<string | null>(null)
  const [postingPulse, setPostingPulse] = useState(false)
  const [showVibePicker, setShowVibePicker] = useState(false)
  const [pulsePhotoUrl, setPulsePhotoUrl] = useState<string | null>(null)
  const [pulsePhotoUploading, setPulsePhotoUploading] = useState(false)

  const isVenueOwner = !!zone?.owner_id && zone.owner_id === userId

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
  const [isSubscribed, setIsSubscribed] = useState(false)   // "following"
  const [isPatron, setIsPatron]         = useState(false)   // subscribed (checked-in)
  const [subLoading, setSubLoading]     = useState(false)
  const [patronLoading, setPatronLoading] = useState(false)

  // Venue badges
  const [venueBadges, setVenueBadges] = useState<VenueBadge[]>([])

  // Gallery submission
  const [submittingPhoto, setSubmittingPhoto] = useState(false)
  const [lightboxUrl, setLightboxUrl]         = useState<string | null>(null)

  // We Met celebration
  const [wemetCelebName, setWemetCelebName] = useState<string | null>(null)
  const wmScale   = useRef(new Animated.Value(0.5)).current
  const wmOpacity = useRef(new Animated.Value(0)).current

  const isCheckedIn = activeSession?.zone_id === id
  // The venue owner can view (monitor) their own Pulse + Chat without checking in,
  // since owners never check in as a person (Jacob feedback 6). View-only — the
  // person composers stay gated to checked-in users; venues post Pulse from the dashboard.
  const isOwner = !!userId && zone?.owner_id === userId
  const canViewFeed = isCheckedIn || isOwner

  // A venue can turn off Chat and/or Pulse (Jacob feedback 6). Hide those tabs.
  const visibleTabs = TABS.filter((t) =>
    !(t.id === 'chat'  && zone?.chat_enabled  === false) &&
    !(t.id === 'pulse' && zone?.pulse_enabled === false)
  )

  // If the selected tab got disabled by the venue, fall back to the first one.
  useEffect(() => {
    if (!zone) return
    if (!visibleTabs.some((t) => t.id === tab) && visibleTabs[0]) setTab(visibleTabs[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone?.chat_enabled, zone?.pulse_enabled])

  // Anonymous chat: assign each other user a stable "Guest N" in order of first
  // appearance in the chat, so nobody's real name is ever shown (Jacob #6).
  const guestNumbers = useMemo(() => {
    const map = new Map<string, number>()
    let n = 0
    for (const m of chatMsgs) {
      if (m.user_id === userId) continue
      if (!map.has(m.user_id)) map.set(m.user_id, ++n)
    }
    return map
  }, [chatMsgs, userId])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data: z } = await supabase
        .from('zones')
        .select('id, name, description, radius_meters, member_count, post_count, center_lat, center_lng, opening_hours, chips, polygon_wkt, is_temporarily_closed, temporary_closure_message, avatar_url, banner_url, owner_id, category, wait_time_minutes, wait_time_updated_at, chat_enabled, pulse_enabled')
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

      // Load gallery photos (approved only — visible to all)
      const { data: photoData } = await supabase
        .from('venue_photos')
        .select('id, public_url, caption')
        .eq('zone_id', id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(20)
      setPhotos(photoData ?? [])

      // Check subscription state
      if (user) {
        const [following, patron] = await Promise.all([
          isFollowingVenue(id),
          isSubscriberOfVenue(id),
        ])
        setIsSubscribed(following)
        setIsPatron(patron)
      }

      // Load venue badges — check for new ones while we're here (fire-and-forget on error)
      checkAndAwardVenueBadges(id)
        .then(setVenueBadges)
        .catch(() => fetchVenueBadges(id).then(setVenueBadges).catch(() => {}))

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

  // Carousel refresh every 15s — silent re-shuffle so no one stays visible too long
  useEffect(() => {
    if (tab !== 'people') return
    const interval = setInterval(() => loadPeople(true), 15_000)
    return () => clearInterval(interval)
  }, [tab, id])

  const loadPeople = async (silent = false) => {
    if (!silent) setPeopleLoading(true)
    const [data, blockedIds] = await Promise.all([
      getActivePeople(id),
      fetchBlockedIds(),
    ])
    const blockedSet = new Set(blockedIds)
    // Not Today = opted out of social discovery — hidden from everyone but themselves
    const filtered = data.filter(
      (p) => !blockedSet.has(p.user_id) && (p.mood_mode !== 'not_today' || p.user_id === userId)
    )
    // Shuffle on each refresh so no one can be stalked by watching position
    const meRow = filtered.filter((p) => p.user_id === userId)
    const others = filtered.filter((p) => p.user_id !== userId)
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]]
    }
    // Show at most 10 at a time — your card always pinned first if present
    setPeople([...meRow, ...others].slice(0, 10))
    setPeopleLoading(false)
  }

  const loadEvents = async () => {
    setEventsLoading(true)
    const data = await fetchEvents(id)
    setEvents(data)
    setEventsLoading(false)
  }

  const handleVibeSave = async () => {
    if (!activeSession) return
    setVibeSaving(true)
    if (editSocials.length === 0) { showToast('Pick at least one social mode'); setVibeSaving(false); return }
    const updated = await updateSessionModes(activeSession.id, editSocials, editMood)
    if (updated) {
      await refresh()
      loadPeople(true)
      showToast('Vibe updated')
      setVibeEditOpen(false)
    } else {
      showToast('Could not update — try again')
    }
    setVibeSaving(false)
  }

  const handleWeMet = async (person: ActivePerson) => {
    if (!userId || !isCheckedIn || !activeSession) return
    try {
      // Session cap: max 5 We Mets per check-in
      const { count: wemetCount } = await supabase
        .from('we_met')
        .select('*', { count: 'exact', head: true })
        .eq('initiator_session_id', activeSession.id)
        .in('status', ['pending', 'confirmed'])
      if ((wemetCount ?? 0) >= 5) {
        showToast("You've reached your We Met limit for this session (5 max).", 'info')
        return
      }

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

            successBuzz()
            setWemetCelebName(person.display_name)
            wmScale.setValue(0.5)
            wmOpacity.setValue(0)
            Animated.sequence([
              Animated.parallel([
                Animated.spring(wmScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
                Animated.timing(wmOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
              ]),
              Animated.delay(1200),
              Animated.timing(wmOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
            ]).start(() => setWemetCelebName(null))
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

  const attachPulsePhoto = async (source: 'library' | 'camera') => {
    setPulsePhotoUploading(true)
    try {
      let result: ImagePicker.ImagePickerResult
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') { showToast('Camera access needed for photos.', 'error'); return }
        result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 })
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') { showToast('Photo access needed.', 'error'); return }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 })
      }
      if (result.canceled || !result.assets[0]) return

      const asset = result.assets[0]
      const fileName = `pulse/${id}/${userId}/${Date.now()}.jpg`
      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('venue-media')
        .upload(fileName, arrayBuffer, { contentType: asset.mimeType || 'image/jpeg' })
      if (uploadError) { showToast('Upload failed. Try again.', 'error'); return }

      const { data: urlData } = supabase.storage.from('venue-media').getPublicUrl(fileName)

      // Optional proactive screening (free by default — no-op without a key)
      const screen = await screenImage(urlData.publicUrl)
      if (!screen.ok) {
        await supabase.storage.from('venue-media').remove([fileName]).catch(() => {})
        showToast(screen.reason ?? 'That photo can\'t be posted.', 'error')
        return
      }

      setPulsePhotoUrl(urlData.publicUrl)
    } catch {
      showToast('Could not attach photo. Try again.', 'error')
    } finally {
      setPulsePhotoUploading(false)
    }
  }

  const pickPulsePhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) attachPulsePhoto('camera'); else if (i === 2) attachPulsePhoto('library') },
      )
    } else {
      Alert.alert('Add a photo', 'Share a moment from the venue.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => attachPulsePhoto('camera') },
        { text: 'From Library', onPress: () => attachPulsePhoto('library') },
      ])
    }
  }

  const handlePostPulse = async () => {
    if (!activeSession || (!newPulse.trim() && !vibeTag && !pulsePhotoUrl)) return
    const pulseScreen = screenText(newPulse)
    if (!pulseScreen.ok) { showToast(blockedMessage(pulseScreen.category), 'error'); return }
    setPostingPulse(true)
    try {
      await createPulsePost({
        zoneId: id,
        sessionId: activeSession.id,
        content: newPulse.trim() || undefined,
        vibeTag: vibeTag ?? undefined,
        mediaUrl: pulsePhotoUrl,
        isVenuePost: isVenueOwner,
      })
      setNewPulse('')
      setVibeTag(null)
      setPulsePhotoUrl(null)
      setShowVibePicker(false)
      successBuzz()
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
    const chatScreen = screenText(chatInput)
    if (!chatScreen.ok) { showToast(blockedMessage(chatScreen.category), 'error'); return }
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
        await unfollowVenue(id)
        setIsSubscribed(false)
        setIsPatron(false) // unfollow drops subscription too
      } else {
        await followVenue(id)
        setIsSubscribed(true)
        showToast(`Following ${zone?.name ?? 'this venue'}! You'll see their updates in your feed.`, 'success')
      }
    } catch {
      showToast('Could not update follow status. Try again.', 'error')
    } finally {
      setSubLoading(false)
    }
  }

  const handleSubscribe = async () => {
    if (!isCheckedIn) {
      showToast('Check in here first — subscribing is for people who show up.', 'info')
      return
    }
    setPatronLoading(true)
    try {
      const ok = await subscribeAsPatron(id)
      if (ok) {
        setIsPatron(true)
        setIsSubscribed(true) // subscribing implies following
        successBuzz()
        showToast(`You're a subscriber of ${zone?.name ?? 'this venue'}. You'll get their promos + announcements.`, 'success')
      } else {
        showToast('Could not subscribe. Make sure you\'re checked in here.', 'error')
      }
    } finally {
      setPatronLoading(false)
    }
  }

  const pickAndSubmitPhoto = async (source: 'library' | 'camera') => {
    if (!userId) return
    setSubmittingPhoto(true)
    try {
      let result: ImagePicker.ImagePickerResult
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') {
          showToast('Camera access needed to submit a photo.', 'error')
          return
        }
        result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
          showToast('Photo library access needed to submit a photo.', 'error')
          return
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], allowsEditing: true, quality: 0.8,
        })
      }
      if (result.canceled || !result.assets[0]) return

      const asset = result.assets[0]
      const fileName = `submissions/${id}/${userId}/${Date.now()}.jpg`
      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('venue-media')
        .upload(fileName, arrayBuffer, { contentType: asset.mimeType || 'image/jpeg' })

      if (uploadError) { showToast('Upload failed. Try again.', 'error'); return }

      const { data: urlData } = supabase.storage.from('venue-media').getPublicUrl(fileName)

      await supabase.from('venue_photos').insert({
        zone_id:      id,
        created_by:   userId,
        public_url:   urlData.publicUrl,
        storage_path: fileName,
        status:       'pending',
      })

      showToast('Photo submitted! The venue will review it.', 'success')
    } catch {
      showToast('Could not submit photo. Try again.', 'error')
    } finally {
      setSubmittingPhoto(false)
    }
  }

  const handleSubmitPhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pickAndSubmitPhoto('camera'); else if (i === 2) pickAndSubmitPhoto('library') },
      )
    } else {
      Alert.alert('Submit Photo', 'Choose a photo to submit to this venue.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => pickAndSubmitPhoto('camera') },
        { text: 'From Library', onPress: () => pickAndSubmitPhoto('library') },
      ])
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

  // Secondary venue info (badges / highlights / gallery / submit-photo). Rendered
  // as the Pulse feed's scrollable header so it scrolls away with the feed instead
  // of permanently squeezing the tab windows (Jacob #8/#10). Not shown on
  // People/Chat/Events, which now get the full height.
  const venueInfo = (
    <View>
      {venueBadges.length > 0 && (
        <View style={styles.badgeStrip}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeStripList}>
            {venueBadges.map((b) => (
              <View key={b.slug} style={styles.badgeChip}>
                <Text style={styles.badgeChipIcon}>{b.icon ?? '🏅'}</Text>
                <Text style={styles.badgeChipName}>{b.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {highlights.length > 0 && (
        <View style={styles.highlightsWrap}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsList}>
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

      {photos.length > 0 && (
        <View style={styles.galleryWrap}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryList}>
            {photos.map((p) => (
              <TouchableOpacity key={p.id} style={styles.galleryThumb} onPress={() => setLightboxUrl(p.public_url)} activeOpacity={0.85}>
                <Image source={{ uri: p.public_url }} style={styles.galleryImg} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {isCheckedIn && (
        <View style={styles.photoSubmitWrap}>
          <TouchableOpacity
            style={[styles.photoSubmitBtn, submittingPhoto && { opacity: 0.5 }]}
            onPress={handleSubmitPhoto}
            disabled={submittingPhoto}
          >
            {submittingPhoto
              ? <ActivityIndicator color="#29B6F6" size="small" />
              : <Text style={styles.photoSubmitText}>Submit a photo to this venue</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  )

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Hero — banner + identity (venue landing, per Jacob's mockup) */}
      <View>
        <View style={styles.banner}>
          {zone?.banner_url ? (
            <Image source={{ uri: zone.banner_url }} style={styles.bannerImg} resizeMode="cover" />
          ) : (
            <View style={styles.bannerFallback} />
          )}
          <View style={styles.bannerScrim} pointerEvents="none" />
          <View style={[styles.bannerTopRow, { top: insets.top + 6 }]}>
            <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} />
            {isCheckedIn && (
              <View style={styles.hereNowPill}>
                <View style={styles.hereNowDot} />
                <Text style={styles.hereNowText}>HERE NOW</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.heroInfo}>
          <View style={styles.heroRow}>
            {zone?.avatar_url ? (
              <Image source={{ uri: zone.avatar_url }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarFallback]}>
                <Text style={styles.heroAvatarLetter}>{(zone?.name ?? '?')[0]}</Text>
              </View>
            )}
            <View style={styles.headerInfo}>
              <Text style={styles.zoneName} numberOfLines={1}>{zone?.name}</Text>
              <Text style={styles.zoneMeta} numberOfLines={1}>
                {[zone?.category, zone?.opening_hours].filter(Boolean).join(' · ')
                  || (zone?.chips?.length
                    ? zone.chips.slice(0, 3).join(' · ')
                    : (zone?.polygon_wkt ? 'Polygon Venue' : `${zone?.radius_meters}m radius`))}
              </Text>
            </View>
          </View>

          {/* Live wait time (venue-set) */}
          {typeof zone?.wait_time_minutes === 'number' && (
            <View style={styles.waitPill}>
              <View style={styles.waitDot} />
              <Text style={styles.waitText}>
                {zone.wait_time_minutes === 0 ? 'No wait right now' : `~${zone.wait_time_minutes} min wait`}
              </Text>
            </View>
          )}

          {zone?.description ? (
            <Text style={styles.heroBio} numberOfLines={2}>{zone.description}</Text>
          ) : null}

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={[styles.subBtn, isSubscribed && styles.subBtnActive]}
              onPress={handleSubscribeToggle}
              disabled={subLoading}
            >
              <Text style={[styles.subBtnText, isSubscribed && styles.subBtnTextActive]}>
                {subLoading ? '…' : isSubscribed ? '· Following' : '+ Follow'}
              </Text>
            </TouchableOpacity>

            {/* Message the venue — followers/subscribers only, no We Met, no expiry */}
            {!isOwner && isSubscribed && (
              <TouchableOpacity
                style={styles.msgVenueBtn}
                onPress={() => router.push(`/messages/venue/${id}` as any)}
              >
                <Text style={styles.msgVenueBtnText}>💬 Message</Text>
              </TouchableOpacity>
            )}

            {/* Subscribe — earned, checked-in patrons only */}
            {isPatron ? (
              <View style={styles.patronBadge}>
                <Text style={styles.patronBadgeText}>★ Subscriber</Text>
              </View>
            ) : isCheckedIn ? (
              <TouchableOpacity
                style={styles.patronBtn}
                onPress={handleSubscribe}
                disabled={patronLoading}
              >
                <Text style={styles.patronBtnText}>{patronLoading ? '…' : '★ Subscribe'}</Text>
              </TouchableOpacity>
            ) : null}

            {isCheckedIn ? (
              <TouchableOpacity style={styles.checkOutBtn} onPress={handleCheckOut}>
                <Text style={styles.checkOutText}>Leave</Text>
              </TouchableOpacity>
            ) : zone?.is_temporarily_closed ? (
              <View style={styles.closedBadge}>
                <Text style={styles.closedBadgeText}>Closed</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.checkInBtn}
                onPress={() => router.push(`/check-in/${id}`)}
              >
                <Text style={styles.checkInText}>Check In</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Heat bar — only when checked in */}
      {isCheckedIn && (
        <View style={styles.heatBarWrap}>
          <HeatBar count={people.length + (activeSession ? 1 : 0)} />
        </View>
      )}

      {/* Your vibe — editable mid-session (people change their minds) */}
      {isCheckedIn && activeSession && (
        <View style={styles.vibeWrap}>
          {!vibeEditOpen ? (
            <View style={styles.vibeRow}>
              <Text style={styles.vibeLabel}>Your vibe</Text>
              {allSocialModes(activeSession).map((m) => <SocialModeBadge key={m} mode={m} />)}
              <MoodBadge mode={activeSession.mood_mode} />
              <TouchableOpacity
                onPress={() => {
                  setEditSocials(allSocialModes(activeSession))
                  setEditMood(activeSession.mood_mode)
                  setVibeEditOpen(true)
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.vibeEditLink}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.vibeEditor}>
              <Text style={styles.vibeEditorTitle}>Social Mode</Text>
              <View style={styles.modePillRow}>
                {VIBE_SOCIAL_OPTIONS.map((o) => {
                  const on = editSocials.includes(o.mode)
                  return (
                  <TouchableOpacity
                    key={o.mode}
                    style={[
                      styles.modePill,
                      on && { backgroundColor: o.color + '22', borderColor: o.color },
                    ]}
                    onPress={() => setEditSocials((prev) =>
                      prev.includes(o.mode) ? prev.filter((m) => m !== o.mode) : [...prev, o.mode])}
                  >
                    <Text style={[styles.modePillText, on && { color: o.color }]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                  )
                })}
              </View>
              <Text style={styles.vibeEditorTitle}>Mood</Text>
              <View style={styles.modePillRow}>
                {VIBE_MOOD_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.mode}
                    style={[
                      styles.modePill,
                      editMood === o.mode && { backgroundColor: o.color + '22', borderColor: o.color },
                    ]}
                    onPress={() => setEditMood(o.mode)}
                  >
                    <Text style={[styles.modePillText, editMood === o.mode && { color: o.color }]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.vibeEditorActions}>
                <TouchableOpacity onPress={() => setVibeEditOpen(false)} disabled={vibeSaving}>
                  <Text style={styles.vibeCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.vibeSaveBtn, vibeSaving && { opacity: 0.6 }]}
                  onPress={handleVibeSave}
                  disabled={vibeSaving}
                >
                  <Text style={styles.vibeSaveText}>{vibeSaving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Temporary closure banner */}
      {zone?.is_temporarily_closed && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedBannerTitle}>Temporarily Closed</Text>
          {zone.temporary_closure_message ? (
            <Text style={styles.closedBannerMsg}>{zone.temporary_closure_message}</Text>
          ) : null}
        </View>
      )}

      {/* (Badges / highlights / gallery / submit-photo moved into the Pulse feed
          header — see `venueInfo` — so they scroll instead of squeezing the tabs.) */}

      {/* Inner tabs — pill toggle */}
      <View style={styles.tabBar}>
        {visibleTabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabItem, tab === t.id && styles.tabItemActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}

      {/* Gate: People / Chat require physical check-in (hard wall) */}
      {((tab === 'people' && !isCheckedIn) || (tab === 'chat' && !canViewFeed)) && (
        <View style={styles.gateWall}>
          <Text style={styles.gateTitle}>Check in to join</Text>
          <Text style={styles.gateSub}>
            {tab === 'people'
              ? "You can only see who's here once you're actually here."
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

      {/* Pulse blurred preview — ghost posts visible, CTA overlay prompts check-in */}
      {tab === 'pulse' && !canViewFeed && (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" style={styles.flex} contentContainerStyle={{ flexGrow: 1 }}>
          {venueInfo}
          <View style={{ flex: 1, position: 'relative', minHeight: 240 }}>
            <FlatList
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              data={pulsePosts.slice(0, 3)}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View pointerEvents="none" style={{ opacity: 0.07 }}>
                  <PulsePostCard
                    post={item}
                    currentUserId=""
                    onDeleted={() => {}}
                    onReport={() => {}}
                  />
                </View>
              )}
              ListEmptyComponent={<View style={{ height: 220 }} />}
            />
            <View style={styles.pulseGateOverlay}>
              <Text style={styles.gateTitle}>The Pulse</Text>
              <Text style={styles.gateSub}>Check in to see what people are posting right now.</Text>
              <TouchableOpacity
                style={[styles.gateBtn, { marginTop: 8 }]}
                onPress={() => router.push(`/check-in/${id}`)}
              >
                <Text style={styles.gateBtnText}>Check In →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {tab === 'people' && isCheckedIn && (
        <FlatList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
              <Text style={styles.emptyTitle}>No one here yet</Text>
              <Text style={styles.emptySub}>
                {isCheckedIn
                  ? 'You\'re the first one. Hold down the vibe.'
                  : 'Check in to see who\'s here.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            people.length >= 10 ? (
              <Text style={styles.peopleFooter}>Showing 10 of {zone?.member_count ?? people.length} — list refreshes every 15s</Text>
            ) : null
          }
        />
      )}

      {tab === 'pulse' && canViewFeed && (
        <View style={styles.flex}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            data={pulsePosts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={venueInfo}
            renderItem={({ item }) => (
              <PulsePostCard
                post={item}
                currentUserId={userId ?? ''}
                canPin={isVenueOwner}
                onDeleted={refreshPulse}
                onReport={handleReportPost}
                onPinChanged={refreshPulse}
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
              {/* Attached photo preview */}
              {pulsePhotoUrl && (
                <View style={styles.pulsePhotoPreview}>
                  <Image source={{ uri: pulsePhotoUrl }} style={styles.pulsePhotoImg} resizeMode="cover" />
                  <TouchableOpacity style={styles.pulsePhotoRemove} onPress={() => setPulsePhotoUrl(null)}>
                    <Text style={styles.pulsePhotoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={[styles.pulseRow, { paddingBottom: insets.bottom + 10 }]}>
                <TouchableOpacity
                  style={styles.vibeToggle}
                  onPress={() => setShowVibePicker(!showVibePicker)}
                >
                  <Text style={styles.vibeToggleText}>{vibeTag ? '🏷️' : '✨'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.vibeToggle}
                  onPress={pickPulsePhoto}
                  disabled={pulsePhotoUploading}
                >
                  {pulsePhotoUploading
                    ? <ActivityIndicator color="#29B6F6" size="small" />
                    : <Text style={styles.vibeToggleText}>{pulsePhotoUrl ? '🖼️' : '📷'}</Text>}
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
                  style={[styles.postBtn, (!newPulse.trim() && !vibeTag && !pulsePhotoUrl) && styles.postBtnDisabled]}
                  onPress={handlePostPulse}
                  disabled={postingPulse || (!newPulse.trim() && !vibeTag && !pulsePhotoUrl)}
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

      {tab === 'chat' && canViewFeed && (
        <View style={styles.flex}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ref={chatListRef}
            data={chatMsgs}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[styles.list, { paddingBottom: 8 }]}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <ChatMessage
                message={item}
                currentUserId={userId ?? ''}
                senderLabel={`Guest ${guestNumbers.get(item.user_id) ?? '?'}`}
              />
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          onRefresh={loadEvents}
          refreshing={eventsLoading}
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
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptySub}>Events are posted by the venue.</Text>
            </View>
          }
        />
      )}
      {wemetCelebName !== null && (
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.wmOverlay, { opacity: wmOpacity }]} pointerEvents="none">
          <Animated.View style={[styles.wmContent, { transform: [{ scale: wmScale }] }]}>
            <Text style={styles.wmEmoji}>🤝</Text>
            <Text style={styles.wmTitle}>We Met!</Text>
            <Text style={styles.wmName}>{wemetCelebName}</Text>
          </Animated.View>
        </Animated.View>
      )}

      {/* Gallery photo lightbox (Jacob #11) */}
      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <TouchableOpacity style={styles.lightboxBg} activeOpacity={1} onPress={() => setLightboxUrl(null)}>
          {lightboxUrl && <Image source={{ uri: lightboxUrl }} style={styles.lightboxImg} resizeMode="contain" />}
          <View style={styles.lightboxClose}><Text style={styles.lightboxCloseText}>✕</Text></View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  flex:      { flex: 1 },
  banner: { height: 180, backgroundColor: '#07101F' },
  bannerImg: { width: '100%', height: '100%' },
  bannerFallback: { flex: 1, backgroundColor: '#081426' },
  bannerScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,10,21,0.35)' },
  bannerTopRow: {
    position: 'absolute',
    left: 8,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hereNowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5,10,21,0.78)',
    borderColor: '#29B6F6',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  hereNowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  hereNowText: { color: '#29B6F6', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroInfo: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    ...Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as const, width: '100%' as any }, default: {} }),
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: -24 },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#050A15',
    backgroundColor: '#0D1B2E',
  },
  heroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  heroAvatarLetter: { color: '#29B6F6', fontSize: 22, fontWeight: '900' },
  heroBio: { color: '#7A93AC', fontSize: 13, lineHeight: 18, marginTop: 8 },
  waitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    marginTop: 10, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1A2E4A', borderWidth: 1, borderColor: '#29B6F640',
  },
  waitDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#29B6F6' },
  waitText: { color: '#cfe8fb', fontSize: 12, fontWeight: '700' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
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
  msgVenueBtn: {
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#0D1B2E',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  msgVenueBtnText: { color: '#8EADC7', fontWeight: '700', fontSize: 12 },
  patronBtn: {
    borderWidth: 1, borderColor: '#f59e0b', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#f59e0b12',
  },
  patronBtnText: { color: '#f59e0b', fontWeight: '800', fontSize: 12 },
  patronBadge: {
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b55',
  },
  patronBadgeText: { color: '#f59e0b', fontWeight: '800', fontSize: 12 },
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
    marginHorizontal: 14,
    marginVertical: 10,
    backgroundColor: '#07101F',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    ...Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as const, width: '100%' as any }, default: {} }),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: '#29B6F61A',
  },
  tabLabel: { fontSize: 12, color: '#4A6580', fontWeight: '600', letterSpacing: 0.1 },
  tabLabelActive: { color: '#29B6F6', fontWeight: '700' },
  list: { padding: 14, gap: 10, ...Platform.select({ web: { maxWidth: 560, alignSelf: 'center' as const, width: '100%' as any }, default: {} }) },
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
  pulsePhotoPreview: {
    position: 'relative', marginHorizontal: 12, marginBottom: 8,
    borderRadius: 12, overflow: 'hidden',
  },
  pulsePhotoImg: { width: '100%', height: 140, backgroundColor: '#07101F' },
  pulsePhotoRemove: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(5,10,21,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  pulsePhotoRemoveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  vibeWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  vibeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  vibeLabel: { fontSize: 12, color: '#7A93AC', fontWeight: '600' },
  vibeEditLink: { fontSize: 12, color: '#29B6F6', fontWeight: '700' },
  vibeEditor: {
    backgroundColor: '#0B1524', borderColor: '#1E293B', borderWidth: 1,
    borderRadius: 16, padding: 14, gap: 8,
  },
  vibeEditorTitle: { fontSize: 11, fontWeight: '700', color: '#7A93AC', textTransform: 'uppercase', letterSpacing: 1 },
  modePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modePill: {
    borderWidth: 1, borderColor: '#1E293B', borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center',
  },
  modePillText: { fontSize: 13, fontWeight: '600', color: '#7A93AC' },
  vibeEditorActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 4 },
  vibeCancelText: { fontSize: 13, color: '#7A93AC', fontWeight: '600' },
  vibeSaveBtn: { backgroundColor: '#29B6F6', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9 },
  vibeSaveText: { fontSize: 13, fontWeight: '800', color: '#050A15' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  emptySub: { fontSize: 13, color: '#7A93AC', textAlign: 'center', paddingHorizontal: 32 },
  peopleFooter: { fontSize: 11, color: '#3D5A73', textAlign: 'center', paddingVertical: 16, paddingHorizontal: 24 },
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
  lightboxBg:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  lightboxImg:  { width: '100%', height: '80%' },
  lightboxClose: { position: 'absolute', top: 50, right: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  lightboxCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  photoSubmitWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
  },
  photoSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  photoSubmitText: { fontSize: 13, color: '#7A93AC', fontWeight: '600' },
  closedBadge: {
    backgroundColor: '#ef444418',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  closedBadgeText: { color: '#ef4444', fontWeight: '700', fontSize: 12 },
  closedBanner: {
    backgroundColor: '#ef444412',
    borderBottomWidth: 1,
    borderBottomColor: '#ef444440',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  closedBannerTitle: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  closedBannerMsg:   { color: '#fca5a5', fontSize: 13, lineHeight: 18 },
  pulseGateOverlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: '#050A15BB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  badgeStrip: {
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    paddingVertical: 8,
  },
  badgeStripList: {
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#29B6F625',
  },
  badgeChipIcon: { fontSize: 13 },
  badgeChipName: { fontSize: 11, fontWeight: '700', color: '#8EADC7' },
  wmOverlay: {
    backgroundColor: 'rgba(5,10,21,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wmContent: { alignItems: 'center', gap: 10 },
  wmEmoji:   { fontSize: 64 },
  wmTitle:   { fontSize: 30, fontWeight: '800', color: '#f8fafc' },
  wmName:    { fontSize: 15, fontWeight: '600', color: '#29B6F6' },
})
