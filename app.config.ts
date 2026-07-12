import { ExpoConfig, ConfigContext } from 'expo/config';
import { withEntitlementsPlist } from 'expo/config-plugins';

// 環境切り替え: APP_ENV=dev|staging|prod（environments.md 参照）。
const APP_ENV = (process.env.APP_ENV ?? 'dev') as 'dev' | 'staging' | 'prod';

// Apple サインイン（匿名→恒久アカウント昇格）は有料 Apple Developer Program が必須
// （expo-apple-authentication の config plugin が entitlement com.apple.developer.applesignin を
// 無条件に注入し、無料の Personal Team では provisioning profile が作成できずビルド自体が失敗する）。
// 無料運用を優先する方針のため既定では Apple プラグイン自体を含めない。EXPO_PUBLIC_ 接頭辞にしている
// のは、この判定をビルド設定（本ファイル）だけでなくクライアント実行時（nativeCredentialSourceInstall.ts
// の isAvailableAsync ガード。entitlement 未付与でも true を返すネイティブ実装のため、こちらでも
// 明示的にガードしないと「押しても必ず失敗するボタン」が表示されてしまう）にも同じ1つのフラグで
// 揃えるため。将来有料加入したら EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=1 で両方まとめて再度有効化できる。
const appleSignInEnabled =
  process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === '1' ||
  process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === 'true';

// expo-apple-authentication は plugins 配列から外しても、パッケージが node_modules にインストールされて
// いる限り autolinking（@expo/prebuild-config の versionedExpoSDKPackages。ユーザーの plugins 配列の
// 解決より後段で適用される内部実装）経由で entitlement com.apple.developer.applesignin が注入され続ける
// （実機検証で確認済み）。無効時はこの entitlement を明示的に削除して確実に無効化する。plugins 配列に
// 関数プラグインを直接混ぜると型エラーになるため、config オブジェクトへ直接適用する。
function withoutAppleSignInEntitlement(config: ExpoConfig): ExpoConfig {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['com.apple.developer.applesignin'];
    return config;
  });
}

// ネイティブ Google サインイン（配布ビルド用）。iOS はリダイレクト受け取りに逆順クライアントID
// （iosUrlScheme）を CFBundleURLSchemes へ登録する必要がある。GoogleService-Info.plist を使わず
// 環境変数ベースで運用しているため、EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME が設定されているときのみ
// plugin へ渡す（未設定なら iOS の Google サインインは未構成。Android は不要。environments.md）。
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
const googleSignInPlugin: string | [string, { iosUrlScheme: string }] = googleIosUrlScheme
  ? ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]
  : '@react-native-google-signin/google-signin';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base: ExpoConfig = {
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
      // 有料 Apple Developer Program 加入までは既定で無効（上記 appleSignInEnabled 参照）。
      ...(appleSignInEnabled ? { usesAppleSignIn: true } : {}),
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
    plugins: [
      'expo-font',
      // expo-apple-authentication は含めるだけで Sign in with Apple の entitlement を注入し、
      // 無料の Personal Team では provisioning に失敗するため、有効時のみ含める。
      ...(appleSignInEnabled ? ['expo-apple-authentication'] : []),
      googleSignInPlugin,
      // iOS の pod install で「AppCheckCore が GoogleUtilities/RecaptchaInterop に依存するが
      // モジュールを定義していない」エラーになる（@react-native-google-signin 由来）。
      // use_frameworks! :linkage => :static を Podfile に追加すると解消する
      // （ios/ は expo prebuild のたびに再生成されるため Podfile を直接編集しても消える。config
      // plugin 経由が正しい直し方）。
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    ],
    // クライアントに埋め込むのは公開可能な値のみ。シークレットは EAS Secrets / Functions 側で管理。
    extra: {
      appEnv: APP_ENV,
    },
  };

  return appleSignInEnabled ? base : withoutAppleSignInEntitlement(base);
};
