import { Platform, Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from './supabase'

export async function uploadAvatarWeb(
  userId: string,
  source: 'library' | 'camera' = 'library',
): Promise<string | null> {
  if (Platform.OS !== 'web') return uploadAvatarNative(userId, source)

  // Phase 1: pick a file synchronously from user gesture.
  // The upload happens AFTER the Promise resolves so the 300ms focus-timeout
  // (which detects "user dismissed picker without selecting") never races
  // against the async Supabase upload.
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
      // Fallback for browsers that don't fire the cancel event.
      // Cleared immediately if onchange fires, so the upload can't race it.
      focusTimeout = setTimeout(() => settle(null), 2000)
    }
    window.addEventListener('focus', onFocus)

    input.onchange = () => {
      window.removeEventListener('focus', onFocus)
      if (focusTimeout) clearTimeout(focusTimeout) // cancel the fallback timer
      settle(input.files?.[0] ?? null)
    }

    input.click() // synchronous — must stay here to keep gesture context
  })

  if (!file) return null

  if (file.size > 5 * 1024 * 1024) {
    alert('Photo must be under 5MB.')
    return null
  }

  // Phase 2: upload (async, outside the picker Promise so no race).
  const path = `${userId}/avatar.jpg`

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })

  if (error) { console.error('[uploadAvatar]', error.message); return null }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

async function uploadAvatarNative(
  userId: string,
  source: 'library' | 'camera',
): Promise<string | null> {
  let result: ImagePicker.ImagePickerResult

  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Go to iPhone Settings → Expo Go → Camera and allow access, then try again.')
      return null
    }
    result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Photo library access needed', 'Go to iPhone Settings → Expo Go → Photos and allow access, then try again.')
      return null
    }
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
  }

  if (result.canceled || !result.assets[0]) return null

  const asset = result.assets[0]
  const path = `${userId}/avatar.jpg`
  const mimeType = asset.mimeType || 'image/jpeg'

  const response = await fetch(asset.uri)
  const arrayBuffer = await response.arrayBuffer()

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: mimeType, upsert: true })

  if (error) {
    console.error('[uploadAvatar native]', error.message)
    Alert.alert('Upload failed', error.message || 'Could not save your photo. Check your connection and try again.')
    return null
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
