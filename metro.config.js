const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': require.resolve('./shims/opentelemetry-stub.js'),
  'react-native-maps': require.resolve('./shims/react-native-maps-stub.js'),
}

module.exports = config
