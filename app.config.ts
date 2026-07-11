import { ExpoConfig, ConfigContext } from 'expo/config';

// 環境切り替え: APP_ENV=dev|staging|prod（environments.md 参照）。
const APP_ENV = (process.env.APP_ENV ?? 'dev') as 'dev' | 'staging' | 'prod';

// ネイティブ Google サインイン（配布ビルド用）。iOS はリダイレクト受け取りに逆順クライアントID
// （iosUrlScheme）を CFBundleURLSchemes へ登録する必要がある。GoogleService-Info.plist を使わず
// 環境変数ベースで運用しているため、EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME が設定されているときのみ
// plugin へ渡す（未設定なら iOS の Google サインインは未構成。Android は不要。environments.md）。
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
const googleSignInPlugin: string | [string, { iosUrlScheme: string }] = googleIosUrlScheme
  ? ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]
  : '@react-native-google-signin/google-signin';

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
    // Apple サインイン（匿名→恒久アカウント昇格）に必要。開発ビルド／配布時のみ有効。
    usesAppleSignIn: true,
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
  // ネイティブサインイン（配布ビルド用）。Expo Go では未適用（開発ビルド／prebuild でのみ効く）。
  plugins: ['expo-font', 'expo-apple-authentication', googleSignInPlugin],
  // クライアントに埋め込むのは公開可能な値のみ。シークレットは EAS Secrets / Functions 側で管理。
  extra: {
    appEnv: APP_ENV,
  },
});
