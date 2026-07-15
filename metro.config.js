// getSentryExpoConfig wraps Expo's default Metro config to emit the JS source
// maps Sentry needs to symbolicate stack traces. Drop-in for getDefaultConfig.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')
const path = require('path')

const config = getSentryExpoConfig(__dirname)

// Shim @opentelemetry/api -- @supabase/supabase-js uses a dynamic import
// for optional telemetry that Metro can't resolve (no webpackIgnore support).
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': path.resolve(__dirname, 'shims/opentelemetry-stub.js'),
}

module.exports = config
