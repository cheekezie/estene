// Expo's default Metro config detects the pnpm monorepo (watches the workspace
// root, resolves symlinked workspace packages and their `exports` subpaths).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
