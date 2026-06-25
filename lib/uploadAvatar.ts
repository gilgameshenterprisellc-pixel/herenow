import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function uploadAvatarWeb(userId: string): Promise<string | null> {
  if (Platform.OS !== 'web') return null

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'

    // Guard so we only resolve once (cancel + onchange can both fire in some browsers)
    let settled = false
    const settle = (v: string | null) => { if (!settled) { settled = true; resolve(v) } }

    // Modern browsers (Chrome 114+, Firefox 113+) emit 'cancel' when picker is dismissed
    input.addEventListener('cancel', () => settle(null))

    // Safari / older browser fallback: window regains focus after picker closes
    const onFocus = () => {
      window.removeEventListener('focus', onFocus)
      // Give onchange time to fire first if the user did select a file
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

      if (error) {
        console.error('[uploadAvatar]', error.message)
        settle(null)
        return
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      settle(`${data.publicUrl}?v=${Date.now()}`)
    }

    input.click()
  })
}
