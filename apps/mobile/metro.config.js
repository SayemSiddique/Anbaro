const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web fallback bundles wa-sqlite as an asset. Native iOS and
// Android remain the production targets, while this keeps the existing Expo
// web export quality gate working.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
