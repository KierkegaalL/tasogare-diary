import { Platform } from 'react-native';

// ネイティブ Firebase（@react-native-firebase）へ切り替えるかの判定
// （docs/migration-react-native-firebase.md 第3章）。
//
// 方針は既存の「ネイティブ資格情報取得」（nativeAuthBootstrap.ts の
// shouldInstallNativeCredentialSource）と揃える:
//   - 環境フラグ EXPO_PUBLIC_USE_NATIVE_FIREBASE が真のときだけネイティブ経路を使う。
//   - フラグは開発/配布ビルドの .env でのみ真にする（Expo Go 起動時は設定しない）。
//   - Web（Platform.OS === 'web'）は対象外。@react-native-firebase は Web 実装を持たず、Web での
//     恒久アカウント化は QRペアリング経由（environments.md）のため、Web では常に false を返す。
//
// この判定を getAuthProvider()（src/services/auth/index.ts）と
// getEntriesRepository()/getMessagesRepository()（Phase6・実装済み）で共有し、認証と Firestore アクセスを
// 揃ってネイティブ SDK 経路へ切り替える（第2章: Firestore だけの移行では権限拒否になるため）。

// EXPO_PUBLIC_USE_NATIVE_FIREBASE を真偽へ。'1' / 'true'（前後空白・大小無視）を真とする。
// テスト容易性のため flag/platform を明示引数で受け取れるようにする（既定は環境変数・実プラットフォーム）。
export function shouldUseNativeFirebase(
  flag: string | undefined = process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE,
  platform: string = Platform.OS,
): boolean {
  if (platform === 'web') return false;
  const v = flag?.trim().toLowerCase();
  return v === '1' || v === 'true';
}
