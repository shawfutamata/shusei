import type { ConfigContext, ExpoConfig } from 'expo/config';

const displayName = process.env.APP_DISPLAY_NAME || 'TASUKI';
const appSlug = process.env.APP_SLUG || 'member-hub';
const iosBundleIdentifier = process.env.IOS_BUNDLE_ID || 'jp.everycounts.memberhub';
const androidPackage = process.env.ANDROID_PACKAGE || 'jp.everycounts.memberhub';
const expoOwner = process.env.EXPO_OWNER || 'shusei_system';
const easProjectId = process.env.EAS_PROJECT_ID || 'fdcf0a27-45e7-4fb0-b198-4f0eb165e2d9';

const appConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: displayName,
  slug: appSlug,
  owner: expoOwner,
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'memberhub',
  userInterfaceStyle: 'light',
  icon: './assets/givehub/app-icon-v2.png',
  ios: {
    bundleIdentifier: iosBundleIdentifier,
    supportsTablet: false,
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
      ],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription: 'プロフィール写真や探しごとの写真を選ぶために写真を使用します。',
    },
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      foregroundImage: './assets/givehub/app-icon-v2.png',
      backgroundColor: '#2563EB',
    },
    permissions: ['POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    ['expo-image-picker', { photosPermission: 'プロフィール写真や探しごとの写真を選ぶために写真を使用します。' }],
    ['expo-splash-screen', { backgroundColor: '#2563EB', image: './assets/givehub/app-icon-v2.png', imageWidth: 116 }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://tasuki.club',
    eas: { projectId: easProjectId },
  },
});

export default appConfig;
