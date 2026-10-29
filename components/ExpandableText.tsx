// A paragraph that shows two lines with a "Read more" toggle when it runs
// longer. Used for the venue bio, which used to cut off mid-sentence with no
// way to read the rest (Jacob, Oct 28).
//
// Native measures the real line count with a hidden copy of the text, so the
// toggle only appears when the text is actually cut. react-native-web never
// fires onTextLayout, so the web build falls back to a length guess.
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

const COLLAPSED_LINES = 2
const WEB_LONG_CHARS = 120

export default function ExpandableText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const [expanded, setExpanded] = useState(false)
  const [lines, setLines] = useState<number | null>(null)

  // A new venue (or an edited bio) starts collapsed and is measured again.
  useEffect(() => {
    setExpanded(false)
    setLines(null)
  }, [text])

  const measuring = Platform.OS !== 'web' && lines === null
  const long = Platform.OS === 'web' ? text.length > WEB_LONG_CHARS : (lines ?? 0) > COLLAPSED_LINES

  return (
    <View>
      {measuring && (
        <Text
          style={[style, styles.measure]}
          onTextLayout={e => setLines(e.nativeEvent.lines.length)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {text}
        </Text>
      )}
      <Text style={style} numberOfLines={expanded ? undefined : COLLAPSED_LINES}>{text}</Text>
      {long && (
        <Pressable
          onPress={() => setExpanded(v => !v)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 24 }}
          accessibilityRole="button"
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>{expanded ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Same width as the visible copy, out of the layout and invisible.
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  toggle: { alignSelf: 'flex-start', marginTop: 4 },
  toggleText: { color: '#29B6F6', fontSize: 13, fontWeight: '700' },
})
