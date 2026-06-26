import { useEffect, useRef } from 'react'
import type { Zone } from '@/lib/zones'

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
  subscribedIds: Set<string>
}

export const WEB_MAP_HEIGHT = 360

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
  const initial           = zone.name[0]?.toUpperCase() ?? '?'

  const pinBg      = isSelected ? '#fff'  : color
  const labelColor = isSelected ? color   : '#050A15'
  const border     = isSelected ? color   : '#050A15'
  const glowStyle  = isSelected
    ? `0 0 ${glow + 10}px ${color}ee, 0 0 ${glow}px ${color}bb`
    : `0 0 ${glow}px ${color}66`

  // Subscribed venues get a crown emoji instead of just the initial
  const label = tier === 'subscribed' ? '★' : initial

  return L.divIcon({
    html: `
      <div style="position:relative;width:${size}px;height:${h}px;">
        <div style="
          width:${size}px;height:${size}px;
          background:${pinBg};
          border:2.5px solid ${border};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          display:flex;align-items:center;justify-content:center;
          box-shadow:${glowStyle};
          cursor:pointer;
          transition:all 0.15s;
        ">
          <span style="
            transform:rotate(45deg);
            color:${labelColor};
            font-weight:900;
            font-size:${tier === 'subscribed' ? 16 : 13}px;
            font-family:system-ui,sans-serif;
            line-height:1;
          ">${label}</span>
        </div>
        <div style="
          position:absolute;bottom:0;left:50%;transform:translateX(-50%);
          width:4px;height:${tailH}px;
          background:${pinBg};border-radius:0 0 2px 2px;
          box-shadow:${glowStyle};
        "></div>
      </div>
    `,
    className: '',
    iconSize:   [size, h],
    iconAnchor: [size / 2, h],
  })
}

export default function WebMap({ zones, location, selectedId, onPinPress, subscribedIds }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const markersRef    = useRef<Map<string, any>>(new Map())
  const circlesRef    = useRef<Map<string, any>>(new Map())
  const userMarkerRef = useRef<any>(null)

  // Init map once — retry until window.L is available (CDN may load after React mounts)
  useEffect(() => {
    let retryId: ReturnType<typeof setTimeout>

    const tryInit = () => {
      const L = (window as any).L
      if (!L) {
        retryId = setTimeout(tryInit, 200)
        return
      }
      if (!containerRef.current || mapRef.current) return

      const center: [number, number] = location
        ? [location.latitude, location.longitude]
        : [39.9526, -75.1652]

      mapRef.current = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView(center, 15)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current)
    }

    tryInit()
    return () => clearTimeout(retryId)
  }, [])

  // User location dot
  useEffect(() => {
    const L = (window as any).L
    if (!L || !mapRef.current || !location) return

    if (userMarkerRef.current) userMarkerRef.current.remove()

    const userIcon = L.divIcon({
      html: `
        <div style="position:relative;width:18px;height:18px;">
          <div style="
            position:absolute;inset:0;
            background:rgba(41,182,246,0.25);
            border-radius:50%;
            animation:userPulse 1.8s ease-out infinite;
          "></div>
          <div style="
            position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:11px;height:11px;
            background:#29B6F6;border:2.5px solid #050A15;border-radius:50%;
            box-shadow:0 0 10px rgba(41,182,246,0.9);
          "></div>
        </div>
        <style>
          @keyframes userPulse {
            0%   { transform:scale(1); opacity:0.8; }
            100% { transform:scale(2.4); opacity:0; }
          }
        </style>
      `,
      className: '',
      iconSize:   [18, 18],
      iconAnchor: [9, 9],
    })

    userMarkerRef.current = L.marker(
      [location.latitude, location.longitude],
      { icon: userIcon, zIndexOffset: 1000 }
    ).addTo(mapRef.current)
  }, [location])

  // Sync heat circles + markers whenever zones, selection, or subscriptions change
  useEffect(() => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    // Clear old layers
    circlesRef.current.forEach(c => c.remove())
    circlesRef.current.clear()
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    zones.forEach(zone => {
      const tier   = getTier(zone, subscribedIds)
      const { color, heatOpacity } = TIER_STYLE[tier]
      const radius = Math.max(zone.radius_meters ?? 100, 100)

      // Heat circle — drawn first so it's behind the pin
      const circle = L.circle([zone.center_lat, zone.center_lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: heatOpacity,
        weight: 1,
        opacity: heatOpacity * 2,
        interactive: false,
      }).addTo(mapRef.current)
      circlesRef.current.set(zone.id, circle)

      // Pin marker — drawn on top
      const icon   = makeIcon(L, zone, zone.id === selectedId, subscribedIds)
      const marker = L.marker([zone.center_lat, zone.center_lng], { icon })
        .addTo(mapRef.current)
        .on('click', () => onPinPress(zone))
      markersRef.current.set(zone.id, marker)
    })
  }, [zones, selectedId, onPinPress, subscribedIds])

  // Pan to selected zone
  useEffect(() => {
    if (!selectedId || !mapRef.current) return
    const marker = markersRef.current.get(selectedId)
    if (marker) {
      mapRef.current.panTo(marker.getLatLng(), { animate: true, duration: 0.4 })
    }
  }, [selectedId])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: WEB_MAP_HEIGHT, backgroundColor: '#060D1A' }}
    />
  )
}
