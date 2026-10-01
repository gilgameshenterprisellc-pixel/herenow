import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// A small bottom sheet that works the same on iOS, Android and web. Alert.alert
// only fits three or four plain buttons on native and window.confirm cannot show
// a menu at all, so every "Report / Block" choice in the app shares this instead.

export interface ActionSheetOption {
  label: string
  onPress: () => void
  destructive?: boolean
}

export interface ActionSheetConfig {
  title: string
  message?: string
  options: ActionSheetOption[]
}

interface Props {
  config: ActionSheetConfig | null
  onClose: () => void
}

export default function ActionSheet({ config, onClose }: Props) {
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={!!config}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        {/* The inner touchable swallows taps so touching the sheet itself does not close it. */}
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
        >
          <Text style={styles.title}>{config?.title}</Text>
          {!!config?.message && <Text style={styles.message}>{config.message}</Text>}

          <View style={styles.options}>
            {config?.options.map((o, i) => (
              <TouchableOpacity
                key={`${o.label}-${i}`}
                style={[styles.option, i > 0 && styles.optionBorder]}
                onPress={() => { onClose(); o.onPress() }}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.optionText, o.destructive && styles.optionDestructive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(5,10,21,0.8)', justifyContent: 'flex-end',
    ...Platform.select({ web: { alignItems: 'center' } as any, default: {} }),
  },
  sheet: {
    backgroundColor: '#0D1B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: '#1A2E4A', paddingTop: 18, paddingHorizontal: 16, gap: 10,
    ...Platform.select({ web: { width: '100%', maxWidth: 480 } as any, default: { width: '100%' } }),
  },
  title: { fontSize: 16, fontWeight: '800', color: '#f8fafc', textAlign: 'center' },
  message: { fontSize: 13, color: '#7A93AC', textAlign: 'center', lineHeight: 18 },
  options: {
    backgroundColor: '#07101F', borderRadius: 14, borderWidth: 1, borderColor: '#1A2E4A',
    overflow: 'hidden', marginTop: 4,
  },
  option: { paddingVertical: 15, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  optionBorder: { borderTopWidth: 1, borderTopColor: '#1A2E4A' },
  optionText: { fontSize: 16, color: '#29B6F6', fontWeight: '600' },
  optionDestructive: { color: '#f87171' },
  cancel: {
    paddingVertical: 15, alignItems: 'center', borderRadius: 14, minHeight: 48,
    backgroundColor: '#07101F', borderWidth: 1, borderColor: '#1A2E4A', justifyContent: 'center',
  },
  cancelText: { fontSize: 16, color: '#f8fafc', fontWeight: '700' },
})
