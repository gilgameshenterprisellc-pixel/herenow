import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

// Subtle animated neon-orb backdrop for app tab screens.
// Mirrors the breathe pattern from (auth)/login.tsx — same engine, lower opacity.
export default function AnimatedBackground() {
  const o1 = useRef(new Animated.Value(0)).current
  const o2 = useRef(new Animated.Value(0)).current
  const o3 = useRef(new Animated.Value(0)).current
  const y1 = useRef(new Animated.Value(0)).current
  const y2 = useRef(new Animated.Value(0)).current

  const breathe = (val: Animated.Value, dur: number, delay = 0) =>
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, {
          toValue: 1, duration: dur,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(val, {
          toValue: 0, duration: dur,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    )

  useEffect(() => {
    breathe(o1, 4200).start()
    breathe(o2, 5800, 700).start()
    breathe(o3, 3600, 1500).start()
    breathe(y1, 5000).start()
    breathe(y2, 4400, 900).start()

    return () => {
      o1.stopAnimation()
      o2.stopAnimation()
      o3.stopAnimation()
      y1.stopAnimation()
      y2.stopAnimation()
    }
  }, [])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Cyan — top right */}
      <Animated.View style={[s.orb, s.o1, {
        opacity: o1.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.10] }),
        transform: [{ translateY: y1.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) }],
      }]} />

      {/* Blue — top left */}
      <Animated.View style={[s.orb, s.o2, {
        opacity: o2.interpolate({ inputRange: [0, 1], outputRange: [0.03, 0.08] }),
        transform: [{ translateY: y2.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }],
      }]} />

      {/* Teal — bottom center-right */}
      <Animated.View style={[s.orb, s.o3, {
        opacity: o3.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.09] }),
        transform: [{ translateY: o3.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }],
      }]} />
    </View>
  )
}

const s = StyleSheet.create({
  orb:  { position: 'absolute', borderRadius: 999 },
  o1:   { width: 280, height: 280, backgroundColor: '#29B6F6', top: -50,  right: -70  },
  o2:   { width: 200, height: 200, backgroundColor: '#1E40AF', top: 80,   left:  -60  },
  o3:   { width: 240, height: 240, backgroundColor: '#0891B2', bottom: 80, right: -50  },
})
