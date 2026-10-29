// The five optional social link inputs (Instagram, Facebook, TikTok, X,
// website), shared by venue signup and the venue's Set Up / Edit screen so the
// two can never ask for links differently. Each field takes a handle or a
// link; lib/socialLinks.ts turns it into the stored URL and supplies the
// per-field error shown here.
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  SOCIAL_LABELS, SOCIAL_PLACEHOLDERS, SOCIAL_PLATFORMS, type SocialPlatform,
} from '@/lib/socialLinks'

const ICON: Record<SocialPlatform, keyof typeof Ionicons.glyphMap> = {
  instagram: 'logo-instagram',
  facebook:  'logo-facebook',
  tiktok:    'logo-tiktok',
  x:         'logo-x',
  website:   'globe-outline',
}

export default function SocialLinksFields({
  values, errors, onChange, inputStyle,
}: {
  values: Partial<Record<SocialPlatform, string>>
  errors: Partial<Record<SocialPlatform, string>>
  onChange: (platform: SocialPlatform, text: string) => void
  /** The host screen's own input style, so the fields match it. */
  inputStyle?: StyleProp<TextStyle>
}) {
  return (
    <View style={styles.list}>
      {SOCIAL_PLATFORMS.map(platform => (
        <View key={platform} style={styles.field}>
          <View style={styles.labelRow}>
            <Ionicons name={ICON[platform]} size={14} color="#8EADC7" />
            <Text style={styles.label}>{SOCIAL_LABELS[platform]}</Text>
          </View>
          <TextInput
            style={[inputStyle, errors[platform] ? styles.inputError : null]}
            value={values[platform] ?? ''}
            onChangeText={t => onChange(platform, t)}
            placeholder={SOCIAL_PLACEHOLDERS[platform]}
            placeholderTextColor="#4A6580"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            maxLength={200}
            accessibilityLabel={`${SOCIAL_LABELS[platform]} link, optional`}
          />
          {errors[platform] ? <Text style={styles.error}>{errors[platform]}</Text> : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#8EADC7' },
  inputError: { borderColor: '#f87171' },
  error: { fontSize: 12, color: '#f87171' },
})
