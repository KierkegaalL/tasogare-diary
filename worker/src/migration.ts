import { mintCustomToken } from './serviceAccount';
import type { Env } from './env';

// ネイティブ移行ブリッジ（docs/migration-react-native-firebase.md 第4章）。
// - migrateToNativeAuth: 認証必須。既存 JS SDK セッションの ID トークンで確立した uid に対して、
//   同一 uid のカスタムトークンを発行して返す。クライアント（nativeFirebaseAuthProvider）はこれを
//   @react-native-firebase/auth の signInWithCustomToken に渡し、uid・Apple/Google リンク状態・
//   Firestore データを維持したままネイティブ SDK セッションへ引き継ぐ。
//
// 既存の verifyPairingToken（QRペアリング）と同じ mintCustomToken を再利用する薄い実装。
// uid はルータ（index.ts）が verifyFirebaseIdToken で検証済みのものを渡す（本人の ID トークン由来）。
// カスタムトークンの署名にはサービスアカウント秘密鍵が必要で、これはクライアントに置けないため
// サーバ（Worker）側でのみ実行できる（第4章）。

export interface MigrateToNativeAuthResult {
  customToken: string;
}

export async function handleMigrateToNativeAuth(env: Env, uid: string): Promise<MigrateToNativeAuthResult> {
  const customToken = await mintCustomToken(env, uid);
  return { customToken };
}
