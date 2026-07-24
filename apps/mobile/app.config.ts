import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'EventFlow Staff',
  slug: 'eventflow-staff',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',

  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#4F46E5',
  },

  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
    package: 'com.eventflow.staff',
    versionCode: 1,
  },

  ios: {
    bundleIdentifier: 'com.eventflow.staff',
    buildNumber: '1',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    [
      'expo-camera',
      {
        cameraPermission:
          'EventFlow needs camera access to scan QR codes at events.',
      },
    ],
  ],

  extra: {
    apiBaseUrl:
      process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1',

    eas: {
      projectId: 'd694aa5e-7622-49d8-89fc-931c5386a61b',
    },
  },
});