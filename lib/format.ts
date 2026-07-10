// Show a person's name to OTHER people as first name + last initial, e.g.
// "Jacob Hillenbrand" -> "Jacob H." Single-word names are left as-is. Your own
// name is still shown in full on your own screens (Jacob feedback 6 — privacy).
export function publicName(name: string | null | undefined): string {
  if (!name) return 'Someone'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Someone'
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase()
  return lastInitial ? `${first} ${lastInitial}.` : first
}
