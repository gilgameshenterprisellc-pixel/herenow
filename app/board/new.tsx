import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, Switch, ActionSheetIOS, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import { screenImage } from '@/lib/moderation'
import {
  BOARD_CATEGORIES, createPin, updatePin, fetchBoard,
  type BoardCategoryId,
} from '@/lib/board'

// "Pin to Board" composer. With a pinId param it becomes the edit screen —
// same form, prefilled from the feed (authors edit from the Board itself).
export default function PinToBoardScreen() {
  const insets = useSafeAreaInsets()
  const { zoneId, pinId } = useLocalSearchParams<{ zoneId: string; pinId?: string }>()
  const { showToast } = useToast()
  const isEditing = !!pinId

  const [category, setCategory]   = useState<BoardCategoryId | null>(null)
  const [title, setTitle]         = useState('')
  const [body, setBody]           = useState('')
  const [imageUrl, setImageUrl]   = useState<string | null>(null)
  const [anonymous, setAnonymous] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [loadingPin, setLoadingPin] = useState(isEditing)

  useEffect(() => {
    if (!pinId || !zoneId) return
    let cancelled = false
    fetchBoard(zoneId).then((pins) => {
      if (cancelled) return
      const pin = pins.find((p) => p.id === pinId && p.is_own)
      if (!pin) {
        showToast('Could not load that pin.', 'error')
        router.back()
        return
      }
      setCategory(pin.category)
      setTitle(pin.title)
      setBody(pin.body)
      setImageUrl(pin.image_url)
      setAnonymous(pin.is_anonymous)
      setLoadingPin(false)
    })
    return () => { cancelled = true }
  }, [pinId, zoneId])

  const attachImage = async (source: 'library' | 'camera') => {
    setUploading(true)
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

      const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
      if (!user) return

      const asset = result.assets[0]
      const fileName = `board/${zoneId}/${user.id}/${Date.now()}.jpg`
      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('venue-media')
        .upload(fileName, arrayBuffer, { contentType: asset.mimeType || 'image/jpeg' })
      if (uploadError) { showToast('Upload failed. Try again.', 'error'); return }

      const { data: urlData } = supabase.storage.from('venue-media').getPublicUrl(fileName)

      // Same optional proactive screening as Pulse photos (no-op without a key).
      const screen = await screenImage(urlData.publicUrl)
      if (!screen.ok) {
        await supabase.storage.from('venue-media').remove([fileName]).catch(() => {})
        showToast(screen.reason ?? 'That photo can\'t be posted.', 'error')
        return
      }

      setImageUrl(urlData.publicUrl)
    } catch {
      showToast('Could not attach photo. Try again.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const pickImage = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) attachImage('camera'); else if (i === 2) attachImage('library') },
      )
    } else if (Platform.OS === 'web') {
      attachImage('library')
    } else {
      Alert.alert('Add a photo', undefined, [
        { text: 'Take Photo', onPress: () => attachImage('camera') },
        { text: 'Choose from Library', onPress: () => attachImage('library') },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  const handleSubmit = async () => {
    if (!zoneId) { showToast('Venue missing — go back and try again.', 'error'); return }
    if (!category) { showToast('Pick a category for your pin.', 'info'); return }
    if (!title.trim()) { showToast('Give your pin a title.', 'info'); return }
    if (!body.trim()) { showToast('Write something for the board.', 'info'); return }

    setSaving(true)
    if (isEditing) {
      const ok = await updatePin(pinId as string, { category, title, body })
      setSaving(false)
      if (!ok) { showToast('Could not save changes. Try again.', 'error'); return }
      showToast('Pin updated.', 'success')
    } else {
      const result = await createPin({
        zoneId, category, title, body,
        imageUrl, isAnonymous: anonymous,
      })
      setSaving(false)
      if (!result.ok) { showToast(result.reason, 'error'); return }
      showToast('Pinned to the Board.', 'success')
    }
    router.back()
  }

  const readOnly = BOARD_CATEGORIES.filter((c) => !c.respondable)
  const respondable = BOARD_CATEGORIES.filter((c) => c.respondable)

  const categoryChip = (c: typeof BOARD_CATEGORIES[number]) => {
    const active = category === c.id
    return (
      <TouchableOpacity
        key={c.id}
        style={[styles.chip, active && { backgroundColor: c.color + '22', borderColor: c.color }]}
        onPress={() => setCategory(c.id)}
        activeOpacity={0.8}
      >
        <Text style={[styles.chipText, active && { color: c.color }]}>{c.label}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.title}>{isEditing ? 'Edit Pin' : 'Pin to Board'}</Text>
      </View>

      {loadingPin ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : (
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <Text style={styles.groupLabel}>To be read — likes and saves, no replies</Text>
          <View style={styles.chipRow}>{readOnly.map(categoryChip)}</View>
          <Text style={[styles.groupLabel, { marginTop: 8 }]}>Respondable — people can message you about it</Text>
          <View style={styles.chipRow}>{respondable.map(categoryChip)}</View>
        </View>

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Leather couch — $100"
            placeholderTextColor="#4A6580"
            maxLength={80}
          />
        </View>

        {/* Body */}
        <View style={styles.field}>
          <Text style={styles.label}>The note</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={body}
            onChangeText={setBody}
            placeholder="What's it about? Keep it neighborly."
            placeholderTextColor="#4A6580"
            multiline
            maxLength={1000}
          />
        </View>

        {/* Image (create only — keeps edit simple) */}
        {!isEditing && (
          <View style={styles.field}>
            <Text style={styles.label}>Photo (optional)</Text>
            {imageUrl ? (
              <View>
                <Image source={{ uri: imageUrl }} style={styles.preview} resizeMode="cover" />
                <TouchableOpacity onPress={() => setImageUrl(null)}>
                  <Text style={styles.removeImage}>Remove photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.imageBtn} onPress={pickImage} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color="#29B6F6" size="small" />
                  : <Text style={styles.imageBtnText}>Add a photo</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Anonymous toggle (create only — a pin can't change its author story) */}
        {!isEditing && (
          <View style={styles.anonRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.anonTitle}>Post anonymously</Text>
              <Text style={styles.anonSub}>
                Shows "Posted by Anonymous". Still tied to your account behind the scenes for moderation.
              </Text>
            </View>
            <Switch
              value={anonymous}
              onValueChange={setAnonymous}
              trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
              thumbColor="#f8fafc"
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, (!category || !title.trim() || !body.trim() || saving) && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!category || !title.trim() || !body.trim() || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.submitBtnText}>{isEditing ? 'Save Changes' : 'Pin to Board'}</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>
          Pins go up instantly — no approval queue, just like a real bulletin board. The venue can take anything down.
        </Text>
      </ScrollView>
      )}
    </KeyboardAvoidingView>
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
  content: { padding: 16, gap: 20, paddingBottom: 60 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupLabel: { fontSize: 11, color: '#4A6580' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#0D1B2E', borderRadius: 20, borderWidth: 1, borderColor: '#1A2E4A',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: '#7A93AC' },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  preview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#0D1B2E' },
  removeImage: { fontSize: 12, color: '#ef4444', textAlign: 'right', marginTop: 6, paddingRight: 4 },
  imageBtn: {
    borderWidth: 1, borderColor: '#1A2E4A', borderRadius: 10, borderStyle: 'dashed' as any,
    paddingVertical: 18, alignItems: 'center', backgroundColor: '#0D1B2E',
  },
  imageBtnText: { fontSize: 14, color: '#7A93AC', fontWeight: '600' },
  anonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  anonTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  anonSub: { fontSize: 12, color: '#7A93AC', marginTop: 2, lineHeight: 16 },
  submitBtn: {
    backgroundColor: '#29B6F6', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  submitBtnText: { color: '#050A15', fontWeight: '800', fontSize: 16 },
  note: { fontSize: 11, color: '#3A5570', textAlign: 'center', lineHeight: 16 },
})
