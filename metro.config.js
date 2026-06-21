const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Shim packages that can't resolve on web.
// These run as the base resolver; Expo's resolver wraps on top.
// The shims prevent native-only internals from leaking into the web bundle.
const WEB_SHIMS = {
  '@opentelemetry/api': path.resolve(__dirname, 'shims/opentelemetry-stub.js'),
  'react-native-maps': path.resolve(__dirname, 'shims/react-native-maps-stub.js'),
}

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  ...WEB_SHIMS,
}

module.exports = config
