import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import PinBadge from './PinBadge'

const GOLD = '#F5A623'

// Gold founder badge for HereNow founders (Joshua, Jacob, Jamie, early backers).
// The brand location pin (teardrop + white check) with a slight pulsing glow like
// the live map pins — Jacob wanted it on brand and to read as important. Curated
// via profiles.is_founder; separate from the blue Verified badge (VerifiedBadge),
// which is why it's gold, not blue.
export default function FounderBadge({ size = 18 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  const glow = Math.round(size * 0.9)
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.6] })
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] })

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Pulsing glow behind the pin (slight, for depth). */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: glow,
            height: glow,
            borderRadius: glow / 2,
            transform: [{ scale: glowScale }],
            opacity: glowOpacity,
          },
        ]}
      />
      <PinBadge size={size} color={GOLD} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', backgroundColor: GOLD },
})
