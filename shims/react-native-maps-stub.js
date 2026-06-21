// Stub for web builds — react-native-maps is native-only.
// NearbyMap.web.tsx is used on web instead; this prevents Metro from
// choking on codegenNativeCommands when it traverses the package graph.
module.exports = {
  __esModule: true,
  default: () => null,
  MapView: () => null,
  Marker: () => null,
  Circle: () => null,
  Polygon: () => null,
  Polyline: () => null,
  Callout: () => null,
  PROVIDER_DEFAULT: null,
  PROVIDER_GOOGLE: null,
}
