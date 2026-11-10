// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow the bundled SQLite database (assets/db/defifoot.db) to be required
// and embedded as an asset in the APK.
config.resolver.assetExts.push('db');

module.exports = config;