import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { SocialMode } from '@/lib/sessions'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const MODE_CONFIG: Record<SocialMode, { label: string; color: string; bg: string; icon: IoniconName }> = {
  dating:      { label: 'Dating',      color: '#f43f5e', bg: '#f43f5e18', icon: 'heart' },
  friends:     { label: 'Friends',     color: '#22c55e', bg: '#22c55e18', icon: 'people' },
  networking:  { label: 'Networking',  color: '#3b82f6', bg: '#3b82f618', icon: 'briefcase' },
  just_vibes:  { label: 'Just Vibes',  color: '#a855f7', bg: '#a855f718', icon: 'musical-notes' },
}

interface Props {
  mode: SocialMode
  size?: 'sm' | 'md'
}

export default function SocialModeBadge({ mode, size = 'sm' }: Props) {
  const cfg = MODE_CONFIG[mode]
  if (!cfg) return null

  const iconSize = size === 'md' ? 13 : 11

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.color + '44' }, size === 'md' && styles.md]}>
      <Ionicons name={cfg.icon} size={iconSize} color={cfg.color} />
      <Text style={[styles.label, { color: cfg.color }, size === 'md' && styles.labelMd]}>
        {cfg.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  md: { paddingHorizontal: 10, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '600' },
  labelMd: { fontSize: 13 },
})
