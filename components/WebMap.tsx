// Native stub — map is handled by the native MapView in NearbyMap.native.tsx.bak
// On web, Metro resolves WebMap.web.tsx instead of this file.
import type { Zone } from '@/lib/zones'

interface WebMapProps {
  zones?: Zone[]
  location?: { latitude: number; longitude: number } | null
  selectedId?: string | null
  onPinPress?: (zone: Zone) => void
  subscribedIds?: Set<string>
  onMapMove?: (lat: number, lng: number) => void
  recenterTick?: number
  [key: string]: unknown
}

export const WEB_MAP_HEIGHT = 0
export default function WebMap(_props: WebMapProps) { return null }
