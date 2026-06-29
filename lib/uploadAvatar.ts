import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from './supabase'

export async function uploadAvatarWeb(userId: string): Promise<string | null> {
  if (Platform.OS !== 'web') return uploadAvatarNative(userId)

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

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (error) { console.error('[uploadAvatar]', error.message); settle(null); return }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      settle(`${data.publicUrl}?v=${Date.now()}`)
    }

    input.click()
  })
}

async function uploadAvatarNative(userId: string): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') return null

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  })

  if (result.canceled || !result.assets[0]) return null

  const asset = result.assets[0]
  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mimeType = asset.mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`
  const path = `${userId}/avatar.${ext}`

  const response = await fetch(asset.uri)
  const arrayBuffer = await response.arrayBuffer()

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { upsert: true, contentType: mimeType })

  if (error) { console.error('[uploadAvatar native]', error.message); return null }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
