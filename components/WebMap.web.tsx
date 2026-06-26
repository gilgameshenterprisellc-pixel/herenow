import { useEffect, useRef } from 'react'
import type { Zone } from '@/lib/zones'

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
  subscribedIds: Set<string>
  onMapMove?: (lat: number, lng: number) => void
}

export const WEB_MAP_HEIGHT = 400

type Tier = 'subscribed' | 'live' | 'regular'

function getTier(zone: Zone, subscribedIds: Set<string>): Tier {
  if (subscribedIds.has(zone.id)) return 'subscribed'
  if ((zone.member_count ?? 0) > 0) return 'live'
  return 'regular'
}

const TIER_STYLE: Record<Tier, { color: string; size: number; glow: number; heatOpacity: number }> = {
  subscribed: { color: '#f59e0b', size: 48, glow: 22, heatOpacity: 0.18 },
  live:       { color: '#22c55e', size: 40, glow: 14, heatOpacity: 0.10 },
  regular:    { color: '#29B6F6', size: 36, glow: 10, heatOpacity: 0.05 },
}

function makeIcon(L: any, zone: Zone, isSelected: boolean, subscribedIds: Set<string>) {
  const tier              = getTier(zone, subscribedIds)
  const { color, size, glow } = TIER_STYLE[tier]
  const tailH             = Math.round(size * 0.22)
  const h                 = size + tailH
  const label             = tier === 'subscribed' ? '★' : (zone.name[0]?.toUpperCase() ?? '?')
  const pinBg             = isSelected ? '#fff'  : color
  const labelColor        = isSelected ? color   : '#050A15'
  const border            = isSelected ? color   : '#050A15'
  const glowStyle         = isSelected
    ? `0 0 ${glow + 10}px ${color}ee, 0 0 ${glow}px ${color}bb`
    : `0 0 ${glow}px ${color}66`

  return L.divIcon({
    html: `
      <div style="position:relative;width:${size}px;height:${h}px;">
        <div style="
          width:${size}px;height:${size}px;
          background:${pinBg};border:2.5px solid ${border};
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          display:flex;align-items:center;justify-content:center;
          box-shadow:${glowStyle};cursor:pointer;transition:all 0.15s;
        ">
          <span style="transform:rotate(45deg);color:${labelColor};
            font-weight:900;font-size:${tier === 'subscribed' ? 16 : 13}px;
            font-family:system-ui,sans-serif;line-height:1;">
            ${label}
          </span>
        </div>
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
          width:4px;height:${tailH}px;background:${pinBg};border-radius:0 0 2px 2px;
          box-shadow:${glowStyle};"></div>
      </div>`,
    className: '',
    iconSize:   [size, h],
    iconAnchor: [size / 2, h],
  })
}

function makeUserIcon(L: any) {
  return L.divIcon({
    html: `
      <div style="position:relative;width:22px;height:22px;">
        <div style="position:absolute;inset:0;background:rgba(41,182,246,0.2);
          border-radius:50%;animation:uPulse 1.8s ease-out infinite;"></div>
        <div style="position:absolute;inset:0;background:rgba(41,182,246,0.1);
          border-radius:50%;animation:uPulse 1.8s ease-out 0.6s infinite;"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          width:13px;height:13px;background:#29B6F6;border:2.5px solid #050A15;
          border-radius:50%;box-shadow:0 0 12px rgba(41,182,246,0.9);"></div>
        <style>
          @keyframes uPulse {
            0%   { transform:scale(1);opacity:0.8; }
            100% { transform:scale(2.6);opacity:0; }
          }
        </style>
      </div>`,
    className: '',
    iconSize:   [22, 22],
    iconAnchor: [11, 11],
  })
}

// Self-inject Leaflet CSS + JS so we don't depend on web/index.html template
function loadLeaflet(): Promise<any> {
  return new Promise(resolve => {
    const win = window as any
    if (win.L) { resolve(win.L); return }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // If script already being injected by another instance, poll for L
    if (document.getElementById('leaflet-js')) {
      const poll = setInterval(() => {
        if (win.L) { clearInterval(poll); resolve(win.L) }
      }, 100)
      return
    }

    const script = document.createElement('script')
    script.id = 'leaflet-js'
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload  = () => resolve(win.L)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}

export default function WebMap({
  zones, location, selectedId, onPinPress, subscribedIds, onMapMove,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<any>(null)
  const leafletRef      = useRef<any>(null)
  const markersRef      = useRef<Map<string, any>>(new Map())
  const circlesRef      = useRef<Map<string, any>>(new Map())
  const userMarkerRef   = useRef<any>(null)
  const mapReadyRef     = useRef(false)
  const isPanningRef    = useRef(false)

  // Keep latest prop values in refs so async callbacks always see current state
  const zonesRef        = useRef(zones)
  const selectedIdRef   = useRef(selectedId)
  const subscribedIdsRef = useRef(subscribedIds)
  const locationRef     = useRef(location)
  const onMapMoveRef    = useRef(onMapMove)
  const onPinPressRef   = useRef(onPinPress)

  useEffect(() => { zonesRef.current         = zones },        [zones])
  useEffect(() => { selectedIdRef.current     = selectedId },  [selectedId])
  useEffect(() => { subscribedIdsRef.current  = subscribedIds },[subscribedIds])
  useEffect(() => { locationRef.current       = location },    [location])
  useEffect(() => { onMapMoveRef.current      = onMapMove },   [onMapMove])
  useEffect(() => { onPinPressRef.current     = onPinPress },  [onPinPress])

  function syncZones(L: any, map: any) {
    circlesRef.current.forEach(c => c.remove())
    circlesRef.current.clear()
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    zonesRef.current.forEach(zone => {
      const tier   = getTier(zone, subscribedIdsRef.current)
      const { color, heatOpacity } = TIER_STYLE[tier]
      const radius = Math.max(zone.radius_meters ?? 100, 100)

      const circle = L.circle([zone.center_lat, zone.center_lng], {
        radius, color, fillColor: color,
        fillOpacity: heatOpacity, weight: 1, opacity: heatOpacity * 2,
        interactive: false,
      }).addTo(map)
      circlesRef.current.set(zone.id, circle)

      const icon   = makeIcon(L, zone, zone.id === selectedIdRef.current, subscribedIdsRef.current)
      const marker = L.marker([zone.center_lat, zone.center_lng], { icon })
        .addTo(map)
        .on('click', () => onPinPressRef.current(zone))
      markersRef.current.set(zone.id, marker)
    })
  }

  function placeUserMarker(L: any, map: any, loc: { latitude: number; longitude: number }) {
    if (userMarkerRef.current) userMarkerRef.current.remove()
    userMarkerRef.current = L.marker(
      [loc.latitude, loc.longitude],
      { icon: makeUserIcon(L), zIndexOffset: 2000 }
    ).addTo(map)
  }

  // One-time map init — self-injects Leaflet then sets everything up
  useEffect(() => {
    loadLeaflet().then(L => {
      if (!L || !containerRef.current || mapRef.current) return

      leafletRef.current = L

      const loc    = locationRef.current
      const center: [number, number] = loc
        ? [loc.latitude, loc.longitude]
        : [39.8283, -98.5795]  // geographic center of USA as fallback

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView(center, 13)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      mapRef.current  = map
      mapReadyRef.current = true

      // Place user pin immediately if location already set
      if (loc) placeUserMarker(L, map, loc)

      // Draw any zones already loaded before map was ready
      syncZones(L, map)

      // Pan-to-fetch: fire onMapMove when user finishes panning
      map.on('moveend', () => {
        if (isPanningRef.current) return
        const c = map.getCenter()
        onMapMoveRef.current?.(c.lat, c.lng)
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update user location pin when location prop changes
  useEffect(() => {
    if (!mapReadyRef.current || !leafletRef.current || !mapRef.current || !location) return
    placeUserMarker(leafletRef.current, mapRef.current, location)
  }, [location])

  // Re-sync venue pins when zones / selectedId / subscribedIds change
  useEffect(() => {
    if (!mapReadyRef.current || !leafletRef.current || !mapRef.current) return
    syncZones(leafletRef.current, mapRef.current)
  }, [zones, selectedId, subscribedIds])

  // Pan to selected zone without triggering a map-move fetch
  useEffect(() => {
    if (!selectedId || !mapRef.current) return
    const marker = markersRef.current.get(selectedId)
    if (!marker) return
    isPanningRef.current = true
    mapRef.current.panTo(marker.getLatLng(), { animate: true, duration: 0.4 })
    setTimeout(() => { isPanningRef.current = false }, 600)
  }, [selectedId])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: WEB_MAP_HEIGHT, backgroundColor: '#060D1A' }}
    />
  )
}
