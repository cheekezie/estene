import type { ExpoConfig } from 'expo/config';

/** Brand colours (same values as @estene/theme/tokens; config files can't import workspace TS). */
const BRAND_BLUE = '#3230aa';

const LOCATION_WHY = "Estene uses your location while you're online so nearby jobs reach you.";

const config: ExpoConfig = {
  name: 'Estene Rider',
  slug: 'estene-rider',
  scheme: 'estene-rider',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'ng.estene.rider',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_WHY,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_WHY,
      NSCameraUsageDescription: 'Scan parcel tags and take delivery photos.',
      UIBackgroundModes: ['location', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'ng.estene.rider',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: BRAND_BLUE,
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    blockedPermissions: ['RECORD_AUDIO'],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: LOCATION_WHY,
        locationWhenInUsePermission: LOCATION_WHY,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Scan parcel tags and take delivery photos.',
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Take delivery photos as proof of delivery.',
        photosPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: BRAND_BLUE,
        defaultChannel: 'offers',
        enableBackgroundRemoteNotifications: true,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    // Set EAS_PROJECT_ID once `eas init` has created the project; push tokens need it.
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
