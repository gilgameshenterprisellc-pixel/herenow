// Pitch-black Google Maps style for the Nearby map (Jacob: black map so the venue
// heat layer pops). Google-only — Apple Maps can't be custom-styled. Keeps the
// abstract intent from the Apple map: no real-world businesses/POIs, faint roads
// for orientation, dim place names so people still know where they are.
export const BLACK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Keep just city / neighborhood names, dimmed, so the map isn't disorienting.
  { featureType: 'administrative.locality',     elementType: 'labels.text.fill', stylers: [{ visibility: 'on' }, { color: '#3a4756' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ visibility: 'on' }, { color: '#26313d' }] },

  // No real-world businesses / transit — only our venues should stand out.
  { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // Faint streets for orientation, no street labels.
  { featureType: 'road',          elementType: 'geometry', stylers: [{ color: '#0e141c' }] },
  { featureType: 'road',          elementType: 'labels',   stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway',  elementType: 'geometry', stylers: [{ color: '#151e29' }] },

  // Everything else stays black so a heat overlay reads with maximum contrast.
  { featureType: 'water',     elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi.park',  elementType: 'geometry', stylers: [{ color: '#05090f' }] },
]
