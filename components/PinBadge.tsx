import Svg, { Path } from 'react-native-svg'

// HereNow member badge mark: the brand location pin (teardrop) with a bold white
// check inside. One shape, color-parameterized so the whole badge family reads as
// a set — gold = Founders, blue = Verified. Drawn as SVG so it stays crisp at any
// size and matches the reference art exactly (viewBox is 100 x 128, ~1:1.28).
//
// `size` is the rendered HEIGHT so the pin lines up with a text line beside it.
export default function PinBadge({
  size = 18,
  color,
  check = '#FFFFFF',
}: {
  size?: number
  color: string
  check?: string
}) {
  const width = size * (100 / 128)
  // Check stroke scales with the pin so it stays proportional at every size.
  // Deliberately bold: 8.5/128 was near-invisible, 13/128 still read thin, so
  // Jacob asked for bolder again (Jul 2026). 17/128 makes the check pop.
  const strokeWidth = size * (17 / 128)
  return (
    <Svg width={width} height={size} viewBox="0 0 100 128">
      <Path
        d="M50 5 C26.5 5 7.5 24 7.5 47.5 C7.5 69 33 87 48.3 122 C49.1 123.7 50.9 123.7 51.7 122 C67 87 92.5 69 92.5 47.5 C92.5 24 73.5 5 50 5 Z"
        fill={color}
      />
      <Path
        d="M31 47 L44 60 L69 32"
        fill="none"
        stroke={check}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
