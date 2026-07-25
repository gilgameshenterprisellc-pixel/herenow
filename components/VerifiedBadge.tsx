import PinBadge from './PinBadge'

const BLUE = '#2E7DF7'

// Blue verified badge — the brand location pin (teardrop + white check) in blue.
// Same shape as the gold FounderBadge so the two read as one badge family; blue
// distinguishes verified accounts (orgs / creators) from founders.
//
// Not yet wired to a profile field — the verification system is post-MVP. Render
// this wherever `is_verified` lands (mirror the FounderBadge usage in
// app/(tabs)/profile.tsx and app/u/[id].tsx). No pulse: verified is a steady
// state, not a live/"important" cue like the founder glow.
export default function VerifiedBadge({ size = 18 }: { size?: number }) {
  return <PinBadge size={size} color={BLUE} />
}
