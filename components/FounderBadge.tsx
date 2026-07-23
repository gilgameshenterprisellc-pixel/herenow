import { Ionicons } from '@expo/vector-icons'

// Gold verified badge for HereNow founders (Joshua, Jacob, Jamie, early
// backers). Curated via the profiles.is_founder flag — not the same thing as
// the org/creator verification system, which is a separate post-MVP feature.
// Gold sets founders apart from any future blue verification.
export default function FounderBadge({ size = 16 }: { size?: number }) {
  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color="#E8B84B"
      accessibilityLabel="HereNow founder"
    />
  )
}
