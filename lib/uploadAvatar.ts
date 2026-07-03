import { Platform, Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from './supabase'

export async function uploadAvatarWeb(
  userId: string,
  source: 'library' | 'camera' = 'library',
): Promise<string | null> {
  if (Platform.OS !== 'web') return uploadAvatarNative(userId, source)

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'

    let settled = false
    const settle = (v: string | null) => { if (!settled) { settled = true; resolve(v) } }

    input.addEventListener('cancel', () => settle(null))

    const onFocus = () => {
      window.removeEventListener('focus', onFocus)
      setTimeout(() => settle(null), 300)
    }
    window.addEventListener('focus', onFocus)

    input.onchange = async () => {
      window.removeEventListener('focus', onFocus)
      const file = input.files?.[0]
      if (!file) { settle(null); return }

      if (file.size > 5 * 1024 * 1024) {
        alert('Photo must be under 5MB.')
        settle(null)
        return
      }

      const path = `${userId}/avatar.jpg`

      await supabase.storage.from('avatars').remove([path]).catch(() => {})
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type })

      if (error) { console.error('[uploadAvatar]', error.message); settle(null); return }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      settle(`${data.publicUrl}?v=${Date.now()}`)
    }

    input.click()
  })
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

  await supabase.storage.from('avatars').remove([path]).catch(() => {})
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: mimeType })

  if (error) {
    console.error('[uploadAvatar native]', error.message)
    Alert.alert('Upload failed', error.message || 'Could not save your photo. Check your connection and try again.')
    return null
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
