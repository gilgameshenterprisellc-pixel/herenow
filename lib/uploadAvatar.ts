import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function uploadAvatarWeb(userId: string): Promise<string | null> {
  if (Platform.OS !== 'web') return null

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }

      if (file.size > 5 * 1024 * 1024) {
        alert('Photo must be under 5MB.')
        resolve(null)
        return
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (error) {
        console.error('[uploadAvatar]', error.message)
        resolve(null)
        return
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // Cache-bust so the new image loads immediately
      resolve(`${data.publicUrl}?v=${Date.now()}`)
    }

    input.click()
  })
}
