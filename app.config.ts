import { ExpoConfig, ConfigContext } from 'expo/config';

// 環境切り替え: APP_ENV=dev|staging|prod（environments.md 参照）。
const APP_ENV = (process.env.APP_ENV ?? 'dev') as 'dev' | 'staging' | 'prod';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'たそがれ日記',
  slug: 'tasogare-diary',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'tasogare',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.tasogarediary',
  },
  android: {
    package: 'app.tasogarediary',
    adaptiveIcon: {
      backgroundColor: '#EFE7EE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-font'],
  // クライアントに埋め込むのは公開可能な値のみ。シークレットは EAS Secrets / Functions 側で管理。
  extra: {
    appEnv: APP_ENV,
  },
});
