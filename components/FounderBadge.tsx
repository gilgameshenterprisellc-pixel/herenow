import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const GOLD = '#E8B84B'
const CHECK = '#1E1503' // dark check for contrast on gold

// Gold verified badge for HereNow founders (Joshua, Jacob, Jamie, early backers).
// Shaped like the brand location pin (teardrop + check) instead of a plain check,
// with a slight pulsing glow like the live map pins — Jacob wanted it on brand and
// to read as important. Curated via profiles.is_founder; separate from the
// org/creator verification system (post-MVP), which is why it's gold, not blue.
export default function FounderBadge({ size = 22 }: { size?: number }) {
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

  // Square side sized so the 45deg-rotated teardrop fits within `size`.
  const pin = Math.round(size / 1.3)
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.6] })
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] })

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Pulsing glow behind the pin (slight, for depth) */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: pin,
            height: pin,
            borderRadius: pin / 2,
            transform: [{ scale: glowScale }],
            opacity: glowOpacity,
          },
        ]}
      />
      {/* Teardrop pin body: 3 rounded corners + one sharp corner, rotated so the
          point faces down. Solid gold, no hole. */}
      <View
        style={[
          styles.pin,
          {
            width: pin,
            height: pin,
            borderTopLeftRadius: pin / 2,
            borderTopRightRadius: pin / 2,
            borderBottomLeftRadius: pin / 2,
            borderBottomRightRadius: 2,
          },
        ]}
      >
        <Ionicons
          name="checkmark-sharp"
          size={Math.round(pin * 0.55)}
          color={CHECK}
          style={styles.check}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', backgroundColor: GOLD },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    transform: [{ rotate: '45deg' }],
    shadowColor: GOLD,
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  // Counter-rotate so the check sits upright inside the rotated pin.
  check: { transform: [{ rotate: '-45deg' }] },
})
