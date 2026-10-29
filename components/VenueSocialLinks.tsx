// Small icons for a venue's other accounts (Instagram, Facebook, TikTok, X,
// website), under the bio on its profile. Kept quiet on purpose: HereNow's own
// features are the point of the page, these are a courtesy (Jacob, Oct 28).
//
// Tapping opens the https profile link. On a phone with the app installed,
// iOS universal links and Android app links open it in that app; otherwise
// the browser. Links arrive already re-checked by readSocialLinks().
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SOCIAL_LABELS, type SocialPlatform } from '@/lib/socialLinks'

const ICON: Record<SocialPlatform, keyof typeof Ionicons.glyphMap> = {
  instagram: 'logo-instagram',
  facebook:  'logo-facebook',
  tiktok:    'logo-tiktok',
  x:         'logo-x',
  website:   'globe-outline',
}

function openLink(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  Linking.openURL(url).catch(err => console.warn('[venue] could not open link:', err?.message ?? err))
}

export default function VenueSocialLinks({ links }: { links: { platform: SocialPlatform; url: string }[] }) {
  if (links.length === 0) return null
  return (
    <View style={styles.row}>
      {links.map(({ platform, url }) => (
        <Pressable
          key={platform}
          onPress={() => openLink(url)}
          accessibilityRole="link"
          accessibilityLabel={`${SOCIAL_LABELS[platform]}, opens outside HereNow`}
          hitSlop={6}
          style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
        >
          <Ionicons name={ICON[platform]} size={17} color="#8EADC7" />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  icon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#0D1B2E',
  },
  pressed: { opacity: 0.6 },
})
