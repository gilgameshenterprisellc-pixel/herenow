import { useEffect, useRef } from 'react'
import type { Zone } from '@/lib/zones'

interface Props {
  zones: Zone[]
  location: { latitude: number; longitude: number } | null
  selectedId: string | null
  onPinPress: (zone: Zone) => void
}

export const WEB_MAP_HEIGHT = 360

function makeIcon(L: any, zone: Zone, isSelected: boolean) {
  const isLive = (zone.member_count ?? 0) > 0
  const color  = isLive ? '#22c55e' : '#29B6F6'
  const initial = zone.name[0]?.toUpperCase() ?? '?'

  const pinBg      = isSelected ? '#fff'     : color
  const labelColor = isSelected ? color      : '#050A15'
  const border     = isSelected ? color      : '#050A15'
  const glow       = isSelected ? `0 0 20px ${color}cc, 0 0 8px ${color}88` : `0 0 10px ${color}55`

  return L.divIcon({
    html: `
      <div style="position:relative;width:36px;height:44px;">
        <div style="
          width:36px;height:36px;
          background:${pinBg};
          border:2.5px solid ${border};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          display:flex;align-items:center;justify-content:center;
          box-shadow:${glow};
          cursor:pointer;
          transition:all 0.15s;
        ">
          <span style="
            transform:rotate(45deg);
            color:${labelColor};
            font-weight:800;font-size:13px;font-family:system-ui,sans-serif;
            line-height:1;
          ">${initial}</span>
        </div>
        <div style="
          position:absolute;bottom:0;left:50%;transform:translateX(-50%);
          width:4px;height:8px;background:${pinBg};border-radius:0 0 2px 2px;
          box-shadow:${glow};
        "></div>
      </div>
    `,
    className: '',
    iconSize:   [36, 44],
    iconAnchor: [18, 44],
  })
}

export default function WebMap({ zones, location, selectedId, onPinPress }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const markersRef    = useRef<Map<string, any>>(new Map())
  const userMarkerRef = useRef<any>(null)

  // Init map once
  useEffect(() => {
    const L = (window as any).L
    if (!L || !containerRef.current || mapRef.current) return

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
            animation:pulse 1.8s ease-out infinite;
          "></div>
          <div style="
            position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:11px;height:11px;
            background:#29B6F6;border:2.5px solid #050A15;border-radius:50%;
            box-shadow:0 0 10px rgba(41,182,246,0.9);
          "></div>
        </div>
        <style>
          @keyframes pulse {
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

  // Sync zone markers
  useEffect(() => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    // Rebuild all markers (selectedId affects pin style)
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    zones.forEach(zone => {
      const icon   = makeIcon(L, zone, zone.id === selectedId)
      const marker = L.marker([zone.center_lat, zone.center_lng], { icon })
        .addTo(mapRef.current)
        .on('click', () => onPinPress(zone))
      markersRef.current.set(zone.id, marker)
    })
  }, [zones, selectedId, onPinPress])

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
