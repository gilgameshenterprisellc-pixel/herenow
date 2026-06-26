import { Alert, Platform } from 'react-native'

export function platformConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  options?: {
    confirmText?: string
    cancelText?: string
    destructive?: boolean
    onCancel?: () => void
  }
) {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title
    const ok = (window as any).confirm(text)
    if (ok) onConfirm()
    else options?.onCancel?.()
  } else {
    Alert.alert(title, message || undefined, [
      { text: options?.cancelText ?? 'Cancel', style: 'cancel', onPress: options?.onCancel },
      {
        text: options?.confirmText ?? 'OK',
        style: options?.destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ])
  }
}
