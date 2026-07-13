import { ExpoConfig, ConfigContext } from 'expo/config';
import { withEntitlementsPlist, withInfoPlist } from 'expo/config-plugins';

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

// ネイティブ Firebase（@react-native-firebase）への移行フラグ。'1'/'true' の開発ビルドでのみ
// config plugin と googleServicesFile を有効化する（Expo Go / Web は現行の Firebase JS SDK 経路の
// まま。ネイティブモジュールを引き込まない）。migration-react-native-firebase.md 第3章・第5章。
// 未設定（既定）ではプラグインを含めないため、ネイティブ設定ファイルが無くても prebuild は通る。
const useNativeFirebase =
  process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE === '1' ||
  process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE === 'true';

// @react-native-firebase が要求するネイティブ設定ファイル（Firebase Console → プロジェクト設定 →
// iOS/Android アプリを追加 で取得）。公開可能な値だが環境ごと（dev/staging/prod）に別ファイルのため
// リポジトリにはコミットしない（.gitignore 済み）。配置パスは環境変数で上書き可能（既定はルート直下）。
const googleServicesPlist = process.env.EXPO_PUBLIC_GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist';
const googleServicesJson = process.env.EXPO_PUBLIC_GOOGLE_SERVICES_JSON ?? './google-services.json';

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

// @react-native-google-signin の新しいiOS SDK（AppCheck連携）は、上記の逆順クライアントIDとは別に、
// Firebase の **iOS アプリ**の App ID（GOOGLE_APP_ID。形式 "1:PROJECT_NUMBER:ios:HASH"）から
// 派生した URL scheme（":" を "-" に置換し "app-" を付けた形。例:
// "app-1-134687703094-ios-21367886b6723e4d465897"）の登録も要求する（実機検証で
// "Your app is missing support for the following URL schemes: app-1-..." エラーとして判明）。
// 注意: EXPO_PUBLIC_FIREBASE_APP_ID は Web アプリの App ID（"...:web:..."）で別物。iOS アプリを
// Firebase Console に追加した際に発行される iOS 用 App ID をこちらに設定する必要がある。
// @react-native-google-signin の config plugin の iosUrlScheme は1つしか受け付けず、かつ
// "com.googleusercontent.apps." 始まりを強制するため、この2つ目の scheme は withInfoPlist で
// CFBundleURLTypes に別エントリとして追加する。
const firebaseIosAppId = process.env.EXPO_PUBLIC_FIREBASE_IOS_APP_ID;
function withGoogleSignInAppIdUrlScheme(config: ExpoConfig): ExpoConfig {
  if (!firebaseIosAppId) return config;
  const scheme = `app-${firebaseIosAppId.replace(/:/g, '-')}`;
  return withInfoPlist(config, (config) => {
    config.modResults.CFBundleURLTypes = [
      ...(config.modResults.CFBundleURLTypes ?? []),
      { CFBundleURLSchemes: [scheme] },
    ];
    return config;
  });
}

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
      // ネイティブ Firebase 有効時のみ GoogleService-Info.plist を prebuild で ios/ に配置する。
      ...(useNativeFirebase ? { googleServicesFile: googleServicesPlist } : {}),
    },
    android: {
      package: 'app.tasogarediary',
      // ネイティブ Firebase 有効時のみ google-services.json を prebuild で android/ に配置する。
      ...(useNativeFirebase ? { googleServicesFile: googleServicesJson } : {}),
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
      // ネイティブ Firebase（@react-native-firebase）の config plugin。app（+ auth）を有効時のみ含める
      // （firestore パッケージは package.json には追加済みだが config plugin を持たないため plugins には
      // 現れない。migration-react-native-firebase.md 第6章の影響ファイル表と一致）。フラグ未設定の
      // Expo Go 既定バンドルには含めない。
      // なお本プロジェクトは既に expo-build-properties の useFrameworks:'static' を指定しており、
      // RNFirebase を静的フレームワークと併用する際は追加の Podfile 設定（$RNFirebaseAsStaticFramework 等）
      // が要る場合がある。実機の開発ビルドで pod install が通ることを最優先で確認する
      // （migration-react-native-firebase.md 第9章の先読み事項）。
      ...(useNativeFirebase ? ['@react-native-firebase/app', '@react-native-firebase/auth'] : []),
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

  const withApple = appleSignInEnabled ? base : withoutAppleSignInEntitlement(base);
  return withGoogleSignInAppIdUrlScheme(withApple);
};
