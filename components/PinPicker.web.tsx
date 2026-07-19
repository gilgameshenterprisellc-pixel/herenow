import { useEffect, useRef } from 'react'

interface Props {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}

// Re-uses the same self-injecting Leaflet loader from WebMap
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

function makeDropIcon(L: any) {
  return L.divIcon({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;cursor:grab">
        <div style="
          width:32px;height:32px;
          background:#f59e0b;border:3px solid #050A15;
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 0 16px rgba(245,158,11,0.7);">
          <span style="transform:rotate(45deg);color:#050A15;font-size:14px;"></span>
        </div>
        <div style="width:3px;height:10px;background:#f59e0b;border-radius:0 0 2px 2px;
          box-shadow:0 0 8px rgba(245,158,11,0.5);"></div>
      </div>`,
    className: '',
    iconSize:   [32, 44],
    iconAnchor: [16, 44],
  })
}

export default function PinPicker({ lat, lng, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markerRef    = useRef<any>(null)
  const onChangeRef  = useRef(onChange)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Sync marker position when lat/lng props change (e.g. "Use my location" refresh)
  useEffect(() => {
    if (!markerRef.current) return
    markerRef.current.setLatLng([lat, lng])
    mapRef.current?.setView([lat, lng], mapRef.current.getZoom(), { animate: true })
  }, [lat, lng])

  useEffect(() => {
    loadLeaflet().then(L => {
      if (!L || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
        doubleClickZoom: false,
      }).setView([lat, lng], 18)  // zoom 18 = building level

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      const marker = L.marker([lat, lng], {
        icon: makeDropIcon(L),
        draggable: true,
        autoPan: true,
      }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onChangeRef.current(pos.lat, pos.lng)
      })

      // Clicking the map also moves the pin
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        onChangeRef.current(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current    = map
      markerRef.current = marker
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #1A2E4A' }}>
      <div
        style={{
          background: '#0D1B2E',
          padding: '6px 12px',
          fontSize: 12,
          color: '#7A93AC',
          borderBottom: '1px solid #1A2E4A',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span></span>
        <span>Drag the pin or tap the map to set the exact venue location</span>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: 260, background: '#060D1A' }} />
    </div>
  )
}
