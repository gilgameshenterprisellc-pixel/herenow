import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, RefreshControl,
  Image, Alert, ActionSheetIOS,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { screenText, blockedMessage } from '@/lib/textModeration'
import DateTimeField, { formatDateTime } from '@/components/DateTimeField'
import UniversalFeedToggle from '@/components/venue/UniversalFeedToggle'
import { universalFeedError } from '@/lib/universalFeed'

interface Announcement {
  id: string
  message: string
  image_url: string | null
  created_at: string
  /** When it goes out. In the future = scheduled. */
  publish_at: string
}

// The Announcement half of the venue's Broadcast screen (app/venue/broadcast.tsx).
// Announcements reach followers' Updates, and tonight's reach everyone checked
// in (Updates + the Pulse). They go out now or at a scheduled time, and they no
// longer push to every subscriber's phone (Jacob, Oct 29: "I don't want every
// broadcast automatically generating a phone push notification").
export default function AnnouncementsPanel() {
  const { showToast } = useToast()
  const [zoneId, setZoneId]         = useState<string | null>(null)
  const [cityName, setCityName]     = useState<string | null>(null)
  const [noZone, setNoZone]         = useState(false)
  const [annos, setAnnos]           = useState<Announcement[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending]       = useState(false)
  const [uploading, setUploading]   = useState(false)

  const [message, setMessage]         = useState('')
  const [audience, setAudience]       = useState<'all' | 'subscribers'>('all')
  const [when, setWhen]               = useState<'now' | 'later'>('now')
  const [publishAt, setPublishAt]     = useState<Date | null>(null)
  const [toCity, setToCity]           = useState(false)
  const [sentCount, setSentCount]     = useState(0)
  const [localImageUri, setLocalImageUri] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: zone } = await supabase
      .from('zones').select('id, cities(name)').eq('owner_id', user.id).maybeSingle()

    if (!zone) { setNoZone(true); setLoading(false); setRefreshing(false); return }
    setZoneId(zone.id)
    setCityName((zone as any).cities?.name ?? null)

    const { data } = await supabase
      .from('venue_announcements')
      .select('id, message, image_url, created_at, publish_at')
      .eq('zone_id', zone.id)
      .order('publish_at', { ascending: false })
      .limit(30)

    setAnnos((data ?? []) as Announcement[])
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const doPickImage = async (source: 'library' | 'camera') => {
    if (Platform.OS !== 'web') {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Allow camera access to take photos for announcements.')
          return
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Allow photo access to attach images to announcements.')
          return
        }
      }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setLocalImageUri(asset.uri)
    setUploading(true)

    try {
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase()
      const mimeType = asset.mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`
      const fileName = `announcement-${Date.now()}.jpg`

      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('venue-media')
        .upload(fileName, arrayBuffer, { contentType: mimeType })

      if (uploadError) {
        showToast('Image upload failed. Try again.', 'error')
        setLocalImageUri(null)
      } else {
        const { data: urlData } = supabase.storage
          .from('venue-media')
          .getPublicUrl(fileName)
        setUploadedImageUrl(urlData.publicUrl)
      }
    } catch {
      showToast('Image upload failed. Try again.', 'error')
      setLocalImageUri(null)
    } finally {
      setUploading(false)
    }
  }

  const pickImage = () => {
    // Web has no camera action sheet — Alert.alert is a no-op in react-native-web,
    // so go straight to the library file picker (matches gallery/board/profile).
    if (Platform.OS === 'web') { doPickImage('library'); return }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) doPickImage('camera'); else if (i === 2) doPickImage('library') },
      )
    } else {
      Alert.alert('Add Photo', 'How would you like to add a photo?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => doPickImage('camera') },
        { text: 'Choose from Library', onPress: () => doPickImage('library') },
      ])
    }
  }

  const removeImage = () => {
    setLocalImageUri(null)
    setUploadedImageUrl(null)
  }

  const handleSend = async () => {
    if (!zoneId) { showToast('Venue zone not found. Contact support.', 'error'); return }
    if (!message.trim()) { showToast('Message required.', 'error'); return }
    const screen = screenText(message)
    if (!screen.ok) { showToast(blockedMessage(screen.category), 'error'); return }
    if (uploading) { showToast('Image still uploading, please wait.', 'error'); return }
    const scheduled = when === 'later'
    if (scheduled && (!publishAt || publishAt.getTime() < Date.now() + 60_000)) {
      showToast('Pick a time at least a minute from now.', 'error')
      return
    }

    setSending(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setSending(false); return }

    const { data, error } = await supabase
      .from('venue_announcements')
      .insert({
        zone_id:      zoneId,
        created_by:   authUser.id,
        message:      message.trim(),
        audience,
        image_url:    uploadedImageUrl ?? null,
        post_to_feed: toCity,
        // Left out for "now" so the database stamps it (publish_at default now()).
        ...(scheduled && publishAt ? { publish_at: publishAt.toISOString() } : {}),
      })
      .select('id, message, image_url, created_at, publish_at')
      .single()

    if (error) {
      console.warn('[announcements] insert failed:', error.message)
      showToast(universalFeedError(error.message, cityName) ?? 'Failed to send announcement. Try again.', 'error')
      if (toCity) setSentCount((n) => n + 1) // re-read what's left
      setSending(false)
      return
    }

    if (data) {
      setAnnos((prev) => [data as Announcement, ...prev])
      setMessage('')
      setLocalImageUri(null)
      setUploadedImageUrl(null)
      setWhen('now')
      setPublishAt(null)
      setToCity(false)
      setSentCount((n) => n + 1)
      showToast(
        scheduled && publishAt ? `Scheduled for ${formatDateTime(publishAt)}.`
          : toCity ? `Sent to your followers and the ${cityName ?? 'city'} feed.`
          : audience === 'subscribers' ? 'Sent to your subscribers.' : 'Sent to your followers.',
        'success',
      )
    }
    setSending(false)
  }

  const handleDelete = (id: string) => {
    platformConfirm(
      'Delete announcement?',
      'This will remove it from your followers\' feeds too.',
      async () => {
        await supabase.from('venue_announcements').delete().eq('id', id)
        setAnnos((prev) => prev.filter((a) => a.id !== id))
      },
      { confirmText: 'Delete', destructive: true }
    )
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        Platform.select({ web: { maxWidth: 600, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
    >
      <Text style={styles.hint}>
        Announcements go to your followers' Updates, and everyone checked in tonight sees them in Updates and the Pulse. Use them for last-minute updates, schedule changes, or flyers.
      </Text>

      {noZone ? (
        <View style={styles.section}>
          <View style={{ backgroundColor: '#0D1B2E', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#1A2E4A', alignItems: 'center', gap: 10 }}>
            <Ionicons name="megaphone" size={26} color="#29B6F6" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#f8fafc', textAlign: 'center' }}>Announcements not available</Text>
            <Text style={{ fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 }}>Your venue isn't set up yet or your account isn't linked as the venue owner. Contact support if this looks wrong.</Text>
          </View>
        </View>
      ) : null}

      {/* Compose */}
      {!noZone && <View style={styles.section}>
        <Text style={styles.sectionLabel}>SEND ANNOUNCEMENT</Text>

        <TextInput
          style={[styles.input, styles.multiline]}
          value={message}
          onChangeText={setMessage}
          placeholder="e.g. DJ starts at 10pm tonight — come through"
          placeholderTextColor="#4A6580"
          multiline
          maxLength={300}
        />
        <Text style={styles.charCount}>{message.length}/300</Text>

        {/* Image attachment */}
        {localImageUri ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: localImageUri }} style={styles.imagePreview} resizeMode="cover" />
            {uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.uploadingText}>Uploading...</Text>
              </View>
            )}
            {!uploading && (
              <TouchableOpacity style={styles.removeImageBtn} onPress={removeImage}>
                <Text style={styles.removeImageText}>✕</Text>
              </TouchableOpacity>
            )}
            {!uploading && uploadedImageUrl && (
              <View style={styles.uploadedBadge}>
                <Text style={styles.uploadedBadgeText}>✓ Ready</Text>
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.addImageBtn} onPress={pickImage}>
            <Ionicons name="camera" size={22} color="#29B6F6" style={styles.addImageEmoji} />
            <Text style={styles.addImageText}>Add flyer or photo</Text>
          </TouchableOpacity>
        )}

        {/* Audience — who among your followers sees this */}
        <View style={styles.audienceWrap}>
          <Text style={styles.feedLabel}>Who sees this?</Text>
          <View style={styles.audienceRow}>
            <TouchableOpacity
              style={[styles.audienceChip, audience === 'all' && styles.audienceChipOn]}
              onPress={() => setAudience('all')}
            >
              <Text style={[styles.audienceChipText, audience === 'all' && styles.audienceChipTextOn]}>All followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.audienceChip, audience === 'subscribers' && styles.audienceChipGoldOn]}
              onPress={() => setAudience('subscribers')}
            >
              <Text style={[styles.audienceChipText, audience === 'subscribers' && styles.audienceChipTextGoldOn]}> ★ Subscribers only </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* When — now, or held until a set time */}
        <View style={styles.audienceWrap}>
          <Text style={styles.feedLabel}>When?</Text>
          <View style={styles.audienceRow}>
            <TouchableOpacity
              style={[styles.audienceChip, when === 'now' && styles.audienceChipOn]}
              onPress={() => setWhen('now')}
            >
              <Text style={[styles.audienceChipText, when === 'now' && styles.audienceChipTextOn]}>Send now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.audienceChip, when === 'later' && styles.audienceChipOn]}
              onPress={() => setWhen('later')}
            >
              <Text style={[styles.audienceChipText, when === 'later' && styles.audienceChipTextOn]}>Schedule</Text>
            </TouchableOpacity>
          </View>
          {when === 'later' && (
            <DateTimeField value={publishAt} onChange={setPublishAt} placeholder="Tap to pick when it goes out" />
          )}
        </View>

        <UniversalFeedToggle
          zoneId={zoneId}
          cityName={cityName}
          audience={audience}
          value={toCity}
          onChange={setToCity}
          refreshKey={sentCount}
        />

        <TouchableOpacity
          style={[styles.sendBtn, (!message.trim() || sending || uploading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || sending || uploading}
        >
          {sending
            ? <ActivityIndicator color="#050A15" size="small" />
            : <Text style={styles.sendBtnText}>{when === 'later' ? 'Schedule Announcement' : 'Send Announcement'}</Text>
          }
        </TouchableOpacity>
      </View>}

      {/* History */}
      {loading ? (
        <ActivityIndicator color="#29B6F6" style={{ marginTop: 20 }} />
      ) : annos.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOUR ANNOUNCEMENTS</Text>
          {annos.map((a) => (
            <View key={a.id} style={styles.annoCard}>
              <View style={styles.annoTop}>
                {new Date(a.publish_at).getTime() > Date.now() ? (
                  <View style={styles.scheduledBadge}>
                    <Ionicons name="time-outline" size={12} color="#c084fc" />
                    <Text style={styles.scheduledText}>Scheduled · {formatDateTime(new Date(a.publish_at))}</Text>
                  </View>
                ) : (
                  <Text style={styles.annoTime}>{timeAgo(a.publish_at)}</Text>
                )}
                <TouchableOpacity onPress={() => handleDelete(a.id)} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.annoMessage}>{a.message}</Text>
              {a.image_url && (
                <Image
                  source={{ uri: a.image_url }}
                  style={styles.annoImage}
                  resizeMode="cover"
                />
              )}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll:   { flex: 1 },
  content:  { padding: 16, gap: 20, paddingBottom: 60 },
  hint:     { fontSize: 13, color: '#7A93AC', lineHeight: 19 },
  section:  { gap: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#7A93AC',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multiline:  { minHeight: 100, textAlignVertical: 'top' },
  charCount:  { fontSize: 11, color: '#4A6580', textAlign: 'right' },

  addImageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', borderStyle: 'dashed',
  },
  addImageEmoji: { fontSize: 18 },
  addImageText: { fontSize: 14, color: '#7A93AC', fontWeight: '500' },

  imagePreviewWrap: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  imagePreview: { width: '100%', height: 180, borderRadius: 12 },
  uploadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  uploadingText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  removeImageBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  removeImageText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  uploadedBadge: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: '#22c55eCC', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  uploadedBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  feedLabel:   { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  audienceWrap: { gap: 8 },
  audienceRow: { flexDirection: 'row', gap: 8 },
  audienceChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  audienceChipOn: { borderColor: '#29B6F6', backgroundColor: '#29B6F620' },
  audienceChipGoldOn: { borderColor: '#f59e0b', backgroundColor: '#f59e0b20' },
  audienceChipText: { fontSize: 13, fontWeight: '700', color: '#7A93AC' },
  audienceChipTextOn: { color: '#29B6F6' },
  audienceChipTextGoldOn: { color: '#f59e0b' },
  sendBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { fontSize: 15, fontWeight: '800', color: '#050A15' },
  annoCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 8,
  },
  annoTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  annoTime: { fontSize: 11, color: '#7A93AC', flex: 1 },
  scheduledBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
  },
  scheduledText: { fontSize: 11, fontWeight: '700', color: '#c084fc' },
  deleteBtn:     { padding: 4 },
  deleteBtnText: { fontSize: 14, color: '#7A93AC' },
  annoMessage:   { fontSize: 14, color: '#D0E8F5', lineHeight: 20 },
  annoImage: {
    width: '100%', height: 200, borderRadius: 10, marginTop: 4,
  },
})
