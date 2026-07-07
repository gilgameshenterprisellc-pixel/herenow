import { TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'

interface Props {
  onPress?: () => void
}

export default function BackButton({ onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress ?? (() => router.back())}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="chevron-back" size={26} color="#f8fafc" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
})
