import { createContext, useContext, useRef, useCallback } from 'react'
import { Animated } from 'react-native'

interface TabBarScrollCtxType {
  translateY: Animated.Value
  onScroll: (currentY: number) => void
}

const TabBarScrollContext = createContext<TabBarScrollCtxType | null>(null)

export function TabBarScrollProvider({ children }: { children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current
  const lastY      = useRef(0)
  const hidden     = useRef(false)

  const onScroll = useCallback((y: number) => {
    const dy = y - lastY.current
    lastY.current = y

    if (dy > 8 && !hidden.current && y > 60) {
      hidden.current = true
      Animated.spring(translateY, { toValue: 110, useNativeDriver: true, speed: 20, bounciness: 0 }).start()
    } else if (dy < -6 && hidden.current) {
      hidden.current = false
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 2 }).start()
    }
  }, [translateY])

  return (
    <TabBarScrollContext.Provider value={{ translateY, onScroll }}>
      {children}
    </TabBarScrollContext.Provider>
  )
}

export function useTabBarScroll() {
  const ctx = useContext(TabBarScrollContext)
  if (!ctx) throw new Error('useTabBarScroll must be inside TabBarScrollProvider')
  return ctx
}

export { TabBarScrollContext }
