import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, Platform,
  Alert, ActionSheetIOS,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase, getAuthedUser } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { checkAndAwardBadges } from '@/lib/badges'
import BackButton from '@/components/BackButton'

interface Photo {
  id: string
  public_url: string
  caption: string | null
  storage_path: string
  status: string
  created_at: string
}

export default function VenueGalleryScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [zoneId, setZoneId]     = useState<string | null>(null)
  const [ownerId, setOwnerId]   = useState<string | null>(null)
  const [photos, setPhotos]           = useState<Photo[]>([])
  const [pending, setPending]         = useState<Photo[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [noZone, setNoZone]           = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }
    setOwnerId(user.id)

    const { data: zone } = await supabase
      .from('zones').select('id').eq('owner_id', user.id).maybeSingle()
    if (!zone) { setNoZone(true); setLoading(false); setRefreshing(false); return }
    setZoneId(zone.id)

    const { data } = await supabase
      .from('venue_photos')
      .select('id, public_url, caption, storage_path, status, created_at')
      .eq('zone_id', zone.id)
      .order('created_at', { ascending: false })

    const all = (data ?? []) as Photo[]
    setPhotos(all.filter((p) => p.status === 'approved'))
    setPending(all.filter((p) => p.status === 'pending'))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  // Web path: create a file input and click it synchronously so Safari iOS
  // keeps the user gesture context intact. expo-image-picker's async permission
  // checks break the gesture chain on mobile Safari.
  const pickAndUploadWeb = async () => {
    if (!zoneId || !ownerId) return

    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png,image/webp'
      let settled = false
      const settle = (v: File | null) => { if (!settled) { settled = true; resolve(v) } }
      input.addEventListener('cancel', () => settle(null))
      let focusTimeout: ReturnType<typeof setTimeout> | null = null
      const onFocus = () => {
        window.removeEventListener('focus', onFocus)
        focusTimeout = setTimeout(() => settle(null), 2000)
      }
      window.addEventListener('focus', onFocus)
      input.onchange = () => {
        window.removeEventListener('focus', onFocus)
        if (focusTimeout) clearTimeout(focusTimeout)
        settle(input.files?.[0] ?? null)
      }
      input.click() // synchronous — must stay here to keep gesture context
    })

    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      showToast('Photo must be under 10MB.', 'error')
      return
    }

    setUploading(true)
    const fileName = `${zoneId}/${Date.now()}.jpg`

    try {
      const { error: uploadError } = await supabase.storage
        .from('venue-media')
        .upload(fileName, file, { contentType: file.type || 'image/jpeg' })

      if (uploadError) {
        showToast('Upload failed. Try again.', 'error')
        return
      }

      const { data: urlData } = supabase.storage.from('venue-media').getPublicUrl(fileName)

      const { data: inserted, error: insertError } = await supabase
        .from('venue_photos')
        .insert({
          zone_id: zoneId,
          created_by: ownerId,
          public_url: urlData.publicUrl,
          storage_path: fileName,
          status: 'approved',
        })
        .select('id, public_url, caption, storage_path, status, created_at')
        .single()

      if (insertError || !inserted) {
        showToast('Photo saved to storage but failed to record. Try again.', 'error')
        return
      }

      setPhotos((prev) => [inserted as Photo, ...prev])
      showToast('Photo added to gallery!', 'success')
      checkAndAwardBadges('gallery_upload').catch(() => {})
    } catch {
      showToast('Upload failed. Try again.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const pickAndUpload = async (source: 'library' | 'camera') => {
    if (!zoneId || !ownerId) return

    let result: ImagePicker.ImagePickerResult
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        showToast('Camera access needed. Check iPhone Settings → Expo Go → Camera.', 'error')
        return
      }
      result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85 })
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        showToast('Photo library access needed. Check iPhone Settings → Expo Go → Photos.', 'error')
        return
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, quality: 0.85,
      })
    }

    if (result.canceled || !result.assets[0]) return

    setUploading(true)
    const asset = result.assets[0]
    const fileName = `${zoneId}/${Date.now()}.jpg`
    const mimeType = asset.mimeType || 'image/jpeg'

    try {
      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('venue-media')
        .upload(fileName, arrayBuffer, { contentType: mimeType })

      if (uploadError) {
        showToast('Upload failed. Try again.', 'error')
        return
      }

      const { data: urlData } = supabase.storage.from('venue-media').getPublicUrl(fileName)

      const { data: inserted, error: insertError } = await supabase
        .from('venue_photos')
        .insert({
          zone_id: zoneId,
          created_by: ownerId,
          public_url: urlData.publicUrl,
          storage_path: fileName,
          status: 'approved',
        })
        .select('id, public_url, caption, storage_path, status, created_at')
        .single()

      if (insertError || !inserted) {
        showToast('Photo saved to storage but failed to record. Try again.', 'error')
        return
      }

      setPhotos((prev) => [inserted as Photo, ...prev])
      showToast('Photo added to gallery!', 'success')
      checkAndAwardBadges('gallery_upload').catch(() => {})
    } catch {
      showToast('Upload failed. Try again.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleAdd = () => {
    if (Platform.OS === 'web') {
      pickAndUploadWeb()
      return
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pickAndUpload('camera'); else if (i === 2) pickAndUpload('library') },
      )
    } else {
      Alert.alert('Add Photo', 'How would you like to add a photo?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => pickAndUpload('camera') },
        { text: 'Choose from Library', onPress: () => pickAndUpload('library') },
      ])
    }
  }

  const handleDelete = (photo: Photo) => {
    platformConfirm(
      'Remove photo?',
      'This removes it from your gallery permanently.',
      async () => {
        await supabase.storage.from('venue-media').remove([photo.storage_path])
        await supabase.from('venue_photos').delete().eq('id', photo.id)
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
        showToast('Photo removed.', 'info')
      },
      { confirmText: 'Remove', destructive: true }
    )
  }

  const handleApprove = async (photo: Photo) => {
    setReviewingId(photo.id)
    await supabase.from('venue_photos').update({ status: 'approved' }).eq('id', photo.id)
    setPending((prev) => prev.filter((p) => p.id !== photo.id))
    setPhotos((prev) => [{ ...photo, status: 'approved' }, ...prev])
    showToast('Photo approved and added to gallery.', 'success')
    setReviewingId(null)
  }

  const handleReject = (photo: Photo) => {
    platformConfirm(
      'Reject submission?',
      'The photo will be deleted and removed from your queue.',
      async () => {
        setReviewingId(photo.id)
        await supabase.storage.from('venue-media').remove([photo.storage_path])
        await supabase.from('venue_photos').delete().eq('id', photo.id)
        setPending((prev) => prev.filter((p) => p.id !== photo.id))
        showToast('Submission rejected.', 'info')
        setReviewingId(null)
      },
      { confirmText: 'Reject', destructive: true }
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Venue Gallery</Text>
          <Text style={styles.subtitle}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, uploading && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator color="#050A15" size="small" />
            : <Text style={styles.addBtnText}>+ Add</Text>
          }
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Photos appear on your venue's page for guests browsing. Venues only — this won't become Instagram.
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 720, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#29B6F6" />}
      >
        {loading ? (
          <ActivityIndicator color="#29B6F6" style={{ marginTop: 40 }} />
        ) : noZone ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏠</Text>
            <Text style={styles.emptyTitle}>Gallery not available</Text>
            <Text style={styles.emptySub}>Your venue isn't set up yet or your account isn't linked as the venue owner. Contact support if this looks wrong.</Text>
          </View>
        ) : (
          <View style={styles.sections}>
            {/* Pending submissions */}
            {pending.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.pendingLabel}>PENDING REVIEW ({pending.length})</Text>
                {pending.map((p) => (
                  <View key={p.id} style={styles.pendingCard}>
                    <Image source={{ uri: p.public_url }} style={styles.pendingPhoto} resizeMode="cover" />
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        style={[styles.approveBtn, reviewingId === p.id && { opacity: 0.5 }]}
                        onPress={() => handleApprove(p)}
                        disabled={reviewingId === p.id}
                      >
                        <Text style={styles.approveBtnText}>✓ Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.rejectBtn, reviewingId === p.id && { opacity: 0.5 }]}
                        onPress={() => handleReject(p)}
                        disabled={reviewingId === p.id}
                      >
                        <Text style={styles.rejectBtnText}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Approved gallery */}
            {photos.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📸</Text>
                <Text style={styles.emptyTitle}>No photos yet</Text>
                <Text style={styles.emptySub}>Add photos to give guests a feel for your space before they arrive.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={handleAdd}>
                  <Text style={styles.emptyBtnText}>Add First Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.grid}>
                {photos.map((p) => (
                  <View key={p.id} style={styles.photoCell}>
                    <Image source={{ uri: p.public_url }} style={styles.photo} resizeMode="cover" />
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(p)}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const CELL = '48%' as any

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  backBtn:    { padding: 8 },
  backText:   { fontSize: 22, color: '#f8fafc' },
  headerText: { flex: 1 },
  title:      { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  subtitle:   { fontSize: 12, color: '#7A93AC', marginTop: 1 },
  addBtn: {
    backgroundColor: '#29B6F6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#050A15', fontWeight: '800', fontSize: 13 },
  hint: { fontSize: 12, color: '#4A6580', paddingHorizontal: 16, paddingVertical: 10, lineHeight: 17 },
  scroll:  { flex: 1 },
  content: { padding: 12, paddingBottom: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCell: { width: CELL, position: 'relative' },
  photo: {
    width: '100%', aspectRatio: 1, borderRadius: 12,
    backgroundColor: '#0D1B2E',
  },
  deleteBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  emptySub:   { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18, paddingHorizontal: 24 },
  emptyBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { color: '#050A15', fontWeight: '800', fontSize: 14 },
  sections: { gap: 20 },
  pendingSection: { gap: 10 },
  pendingLabel: {
    fontSize: 11, fontWeight: '700', color: '#f59e0b',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pendingCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#f59e0b30', overflow: 'hidden',
  },
  pendingPhoto: { width: '100%', aspectRatio: 16 / 9 },
  pendingActions: {
    flexDirection: 'row', gap: 10, padding: 12,
  },
  approveBtn: {
    flex: 1, backgroundColor: '#22c55e18', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#22c55e40',
  },
  approveBtnText: { color: '#22c55e', fontWeight: '700', fontSize: 14 },
  rejectBtn: {
    flex: 1, backgroundColor: '#ef444418', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#ef444440',
  },
  rejectBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
})
