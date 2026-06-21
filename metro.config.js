const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Shim @opentelemetry/api -- @supabase/supabase-js uses a dynamic import
// for optional telemetry that Metro can't resolve (no webpackIgnore support).
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': path.resolve(__dirname, 'shims/opentelemetry-stub.js'),
}

module.exports = config
