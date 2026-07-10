import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

interface Point { lat: number; lng: number }

interface Props {
  lat: number
  lng: number
  onPolygon: (wkt: string, points: Point[]) => void
  onClear?: () => void
  // Current saved polygon (WKT). Drawn as a red reference so the admin can see
  // exactly where the existing zone sits versus the real building.
  existingWkt?: string | null
}

// Parse a POLYGON((lng lat, ...)) WKT ring into Leaflet [lat, lng] pairs.
function parseWktRing(wkt?: string | null): [number, number][] {
  if (!wkt) return []
  const m = wkt.match(/\(\(([^)]+)\)\)/)
  if (!m) return []
  const ring = m[1].split(',').map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number)
    return [lat, lng] as [number, number]
  }).filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo))
  return ring.length >= 3 ? ring : []
}

// Web-only interactive polygon drawing tool.
// Uses Leaflet from CDN inside a srcdoc iframe — no npm package needed.
// Satellite imagery (Esri) so you can trace the actual building roofline.
// Click the map to add points, then hit "Complete Polygon".
// Communicates back to the parent via postMessage.
export function PolygonDrawMap({ lat, lng, onPolygon, onClear, existingWkt }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const existingRing = parseWktRing(existingWkt)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type === 'herenow_polygon') {
        const pts: Point[] = e.data.points
        if (pts.length < 3) return
        const closed = [...pts, pts[0]]
        const wkt = `POLYGON((${closed.map(p => `${p.lng} ${p.lat}`).join(', ')}))`
        onPolygon(wkt, pts)
      } else if (e.data.type === 'herenow_clear') {
        onClear?.()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onPolygon, onClear])

  if (Platform.OS !== 'web') return null

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html,body,#map{margin:0;padding:0;height:100%;background:#0d1117}
    #toolbar{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
    button{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700}
    #btn-complete{background:#f59e0b;color:#000}
    #btn-undo{background:#1e3a5f;color:#7dd3fc}
    #btn-clear{background:#374151;color:#fff}
    #btn-complete:disabled,#btn-undo:disabled{opacity:0.35;cursor:default}
    #info{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,0.85);color:#fff;padding:5px 14px;border-radius:6px;font-size:12px;white-space:nowrap;font-family:sans-serif}
    #zoom-hint{position:absolute;top:36px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,0.6);color:#94a3b8;padding:3px 10px;border-radius:5px;font-size:11px;white-space:nowrap;font-family:sans-serif}
  </style>
</head>
<body>
<div id="map"></div>
<div id="info">Trace the building roof · 3+ points to complete</div>
<div id="zoom-hint">Red dashed = current saved zone · scroll to zoom</div>
<div id="toolbar">
  <button id="btn-undo" disabled onclick="undoLast()">↩ Undo</button>
  <button id="btn-clear" onclick="clearAll()">Clear</button>
  <button id="btn-complete" disabled onclick="complete()">Complete Polygon ✓</button>
</div>
<script>
var map=L.map('map',{zoomControl:true,maxZoom:22}).setView([${lat},${lng}],20)
// Satellite base so the building roofline is actually visible to trace.
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:22,maxNativeZoom:19,attribution:'Imagery © Esri'}).addTo(map)
// Street + place labels on top for orientation.
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:22,maxNativeZoom:19,opacity:0.85}).addTo(map)
// Draw the currently-saved zone in red so you can see if it is off the building.
var existing=${JSON.stringify(existingRing)}
if(existing.length>=3){
  var ref=L.polygon(existing,{color:'#ef4444',fillColor:'#ef4444',fillOpacity:0.12,weight:2,dashArray:'4 4'}).addTo(map)
  try{map.fitBounds(ref.getBounds(),{padding:[40,40],maxZoom:20})}catch(e){}
}
var pts=[],markers=[],polyline=null,poly=null

function redraw(){
  document.getElementById('btn-complete').disabled=pts.length<3
  document.getElementById('btn-undo').disabled=pts.length===0
  document.getElementById('info').textContent=
    pts.length===0?'Click to place points · 3+ points to complete':
    pts.length<3?pts.length+' point(s) — need at least 3':
    pts.length+' points — add more or click Complete'
  if(polyline){map.removeLayer(polyline);polyline=null}
  if(poly){map.removeLayer(poly);poly=null}
  if(pts.length>=2){
    var ring=pts.concat([pts[0]])
    polyline=L.polyline(ring.map(function(p){return[p.lat,p.lng]}),{color:'#f59e0b',weight:2,dashArray:'5 5'}).addTo(map)
  }
  if(pts.length>=3){
    poly=L.polygon(pts.map(function(p){return[p.lat,p.lng]}),{color:'#f59e0b',fillColor:'#f59e0b',fillOpacity:0.15,weight:2}).addTo(map)
  }
}

map.on('click',function(e){
  var p={lat:e.latlng.lat,lng:e.latlng.lng}
  pts.push(p)
  var m=L.circleMarker([p.lat,p.lng],{radius:5,color:'#f59e0b',fillColor:'#f59e0b',fillOpacity:1,weight:1}).addTo(map)
  markers.push(m)
  redraw()
})

function undoLast(){
  if(pts.length===0)return
  pts.pop()
  var last=markers.pop()
  if(last)map.removeLayer(last)
  redraw()
}

function complete(){
  if(pts.length<3)return
  window.parent.postMessage({type:'herenow_polygon',points:pts.slice()},'*')
}

function clearAll(){
  pts.splice(0)
  markers.forEach(function(m){map.removeLayer(m)})
  markers.splice(0)
  redraw()
  window.parent.postMessage({type:'herenow_clear'},'*')
}
</script>
</body>
</html>`

  return (
    // @ts-ignore — iframe + srcDoc are web-only
    <iframe
      ref={iframeRef}
      srcDoc={html}
      style={{ width: '100%', height: 480, border: 'none', borderRadius: 10, marginTop: 8 }}
      title="Draw building polygon"
      sandbox="allow-scripts"
    />
  )
}
