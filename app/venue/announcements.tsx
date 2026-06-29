import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, RefreshControl, Switch,
  Image, Alert, ActionSheetIOS,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { sendNotification } from '@/lib/notifications'

interface Announcement {
  id: string
  message: string
  post_to_feed: boolean
  image_url: string | null
  created_at: string
}

export default function VenueAnnouncementsScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [zoneId, setZoneId]         = useState<string | null>(null)
  const [annos, setAnnos]           = useState<Announcement[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending]       = useState(false)
  const [uploading, setUploading]   = useState(false)

  const [message, setMessage]         = useState('')
  const [postToFeed, setPostToFeed]   = useState(false)
  const [localImageUri, setLocalImageUri] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: zone } = await supabase
      .from('zones').select('id').eq('owner_id', user.id).maybeSingle()

    if (!zone) { setLoading(false); setRefreshing(false); return }
    setZoneId(zone.id)

    const { data } = await supabase
      .from('venue_announcements')
      .select('id, message, post_to_feed, image_url, created_at')
      .eq('zone_id', zone.id)
      .order('created_at', { ascending: false })
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
    if (!zoneId || !message.trim()) { showToast('Message required.', 'error'); return }
    if (uploading) { showToast('Image still uploading, please wait.', 'error'); return }

    setSending(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setSending(false); return }

    const { data, error } = await supabase
      .from('venue_announcements')
      .insert({
        zone_id:      zoneId,
        created_by:   authUser.id,
        message:      message.trim(),
        post_to_feed: postToFeed,
        image_url:    uploadedImageUrl ?? null,
      })
      .select('id, message, post_to_feed, image_url, created_at')
      .single()

    if (!error && data) {
      setAnnos((prev) => [data as Announcement, ...prev])
      setMessage('')
      setPostToFeed(false)
      setLocalImageUri(null)
      setUploadedImageUrl(null)
      showToast('Announcement sent to your followers!', 'success')

      // Notify all subscribers (best-effort, non-blocking)
      supabase
        .from('venue_subscriptions')
        .select('user_id')
        .eq('zone_id', zoneId)
        .then(({ data: subs }) => {
          if (!subs) return
          const preview = message.trim().slice(0, 80)
          subs.forEach(({ user_id }) => {
            if (user_id === authUser.id) return
            sendNotification({
              userId: user_id,
              type: 'venue_announcement',
              title: '📣 New announcement',
              body: preview,
              data: { zone_id: zoneId },
            }).catch(() => {})
          })
        })
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
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Announcements</Text>
      </View>

      <ScrollView
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
          Announcements go straight to your followers' feeds — use them for last-minute updates, schedule changes, or flyers.
        </Text>

        {/* Compose */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SEND ANNOUNCEMENT</Text>

          <TextInput
            style={[styles.input, styles.multiline]}
            value={message}
            onChangeText={setMessage}
            placeholder="e.g. DJ starts at 10pm tonight — come through 🎵"
            placeholderTextColor="#4A6580"
            multiline
            maxLength={280}
          />
          <Text style={styles.charCount}>{message.length}/280</Text>

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
              <Text style={styles.addImageEmoji}>📷</Text>
              <Text style={styles.addImageText}>Add flyer or photo</Text>
            </TouchableOpacity>
          )}

          <View style={styles.feedRow}>
            <View style={styles.feedRowText}>
              <Text style={styles.feedLabel}>Post to universal feed</Text>
              <Text style={styles.feedSub}>Visible to all HereNow users, not just followers</Text>
            </View>
            <Switch
              value={postToFeed}
              onValueChange={setPostToFeed}
              trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
              thumbColor="#f8fafc"
            />
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, (!message.trim() || sending || uploading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!message.trim() || sending || uploading}
          >
            {sending
              ? <ActivityIndicator color="#050A15" size="small" />
              : <Text style={styles.sendBtnText}>📣 Send Announcement</Text>
            }
          </TouchableOpacity>
        </View>

        {/* History */}
        {loading ? (
          <ActivityIndicator color="#29B6F6" style={{ marginTop: 20 }} />
        ) : annos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SENT ANNOUNCEMENTS</Text>
            {annos.map((a) => (
              <View key={a.id} style={styles.annoCard}>
                <View style={styles.annoTop}>
                  <Text style={styles.annoTime}>{timeAgo(a.created_at)}</Text>
                  {a.post_to_feed && (
                    <View style={styles.feedBadge}>
                      <Text style={styles.feedBadgeText}>📡 Feed</Text>
                    </View>
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
  backBtn:  { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title:    { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
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

  feedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  feedRowText: { flex: 1, gap: 2 },
  feedLabel:   { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  feedSub:     { fontSize: 12, color: '#7A93AC' },
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
  feedBadge: {
    backgroundColor: '#29B6F610', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#29B6F630',
  },
  feedBadgeText: { fontSize: 10, color: '#29B6F6', fontWeight: '700' },
  deleteBtn:     { padding: 4 },
  deleteBtnText: { fontSize: 14, color: '#7A93AC' },
  annoMessage:   { fontSize: 14, color: '#D0E8F5', lineHeight: 20 },
  annoImage: {
    width: '100%', height: 200, borderRadius: 10, marginTop: 4,
  },
})
