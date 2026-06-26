import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'

export type ToastType = 'success' | 'error' | 'info'

interface ToastCtx {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} })

const BG: Record<ToastType, object> = {
  success: { backgroundColor: '#14532d', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
  error:   { backgroundColor: '#7f1d1d', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  info:    { backgroundColor: '#1e3058', borderWidth: 1, borderColor: 'rgba(41,182,246,0.25)' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ message, type })
    timerRef.current = setTimeout(() => setToast(null), 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <View pointerEvents="none" style={[styles.toast, BG[toast.type] as any]}>
          <Text style={styles.text}>{toast.message}</Text>
        </View>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    zIndex: 9999,
  },
  text: { color: '#f8fafc', fontWeight: '600', fontSize: 14, textAlign: 'center' },
})
