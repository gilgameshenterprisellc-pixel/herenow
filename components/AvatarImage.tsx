import { Image, View, Text, StyleSheet } from 'react-native'

interface Props {
  uri?: string | null
  name: string
  size?: number
  muted?: boolean
}

export default function AvatarImage({ uri, name, size = 46, muted = false }: Props) {
  const radius = size / 2
  const initial = name[0]?.toUpperCase() ?? '?'
  const fontSize = Math.round(size * 0.38)

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#1A2E4A' }}
        resizeMode="cover"
      />
    )
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }, muted && styles.muted]}>
      <Text style={[styles.text, { fontSize }]}>{initial}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#29B6F6', alignItems: 'center', justifyContent: 'center' },
  muted:    { backgroundColor: '#1A2E4A' },
  text:     { fontWeight: '800', color: '#050A15' },
})
