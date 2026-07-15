import { Platform } from 'react-native';

// 起動時にネイティブ資格情報ソース（Apple/Google サインインUI）を差し込むブートストラップ。
//
// 課題（Memory.md「Expo Go を壊さない配線方法の検討が必要」）:
//   nativeCredentialSourceInstall.ts は expo-apple-authentication / @react-native-google-signin を
//   トップレベル import する。これらは Expo Go 既定バンドルにネイティブ実装が無く、モジュール評価時
//   （@react-native-google-signin は TurboModuleRegistry.getEnforcing）に例外を投げて起動を壊す。
//   そのため environments.md は「Expo Go 既定パスからは import しない」ことを求めている。
//
// 方針:
//   - 本ファイルはネイティブモジュールを **静的 import しない**（安全に App/index から import できる）。
//   - 環境フラグ EXPO_PUBLIC_ENABLE_NATIVE_AUTH が真のときだけ nativeCredentialSourceInstall を
//     **動的 require** して呼ぶ。Metro の require は遅延評価なので、フラグ未設定の Expo Go では
//     ネイティブモジュールが評価されず起動が壊れない（＝canLinkAccount は false のまま＝導線非表示）。
//   - フラグは開発/配布ビルドの .env でのみ真にする（Expo Go 起動時は設定しない）。
//   - Web（Platform.OS === 'web'）はネイティブ資格情報取得の対象外。@react-native-google-signin/
//     expo-apple-authentication は Web 実装を持たず（前者は「Web support is only available to
//     sponsors」の警告を出し PLAY_SERVICES_NOT_AVAILABLE で失敗する）、Web での恒久アカウント昇格は
//     QRペアリング経由（environments.md）のため、Web では明示的にスキップする。

// EXPO_PUBLIC_ENABLE_NATIVE_AUTH を真偽へ。'1' / 'true'（前後空白・大小無視）を真とする。
// テスト容易性のため flag を明示引数で受け取れるようにする（既定は環境変数）。
export function shouldInstallNativeCredentialSource(
  flag: string | undefined = process.env.EXPO_PUBLIC_ENABLE_NATIVE_AUTH,
): boolean {
  const v = flag?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

// 起動エントリ（index.ts）から一度呼ぶ。ゲートが閉じていれば何もしない（Expo Go 既定）。
// enabled は主にテストから明示注入するための引数（既定は環境変数フラグ判定）。
export function bootstrapNativeCredentialSource(
  enabled: boolean = shouldInstallNativeCredentialSource(),
): void {
  if (!enabled || Platform.OS === 'web') return;
  try {
    // ネイティブモジュールを Expo Go バンドルで評価させないため、静的 import せず動的 require する。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./nativeCredentialSourceInstall') as typeof import('./nativeCredentialSourceInstall');
    // 非同期の失敗（サインイン構成不備など）でも起動は続行させる（uid・本文はログに残さない）。
    void mod.installNativeCredentialSource().catch((err: unknown) => {
      console.warn('installNativeCredentialSource failed', (err as Error)?.name);
    });
  } catch (err) {
    // ネイティブモジュール未リンク（誤って Expo Go でフラグを立てた等）でも起動は止めない。
    console.warn('native credential bootstrap skipped', (err as Error)?.name);
  }
}
