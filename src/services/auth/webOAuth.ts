import { browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

import { getFirebaseAuth } from '../firebase/app';
import { toAuthUser } from './firebaseAuthProvider';
import type { AuthUser } from './types';

// Web版連携画面（Platform.OS === 'web'）向けの Google サインイン代替。
// web/src/lib/oauth.ts の signInWithProvider と同じ signInWithPopup を使う（Expo Web は実ブラウザで
// 動作するため利用可能）。Apple は現状未実装（web/ の /connect と同じ方針で導線のみ用意しボタンは無効化）。
// getFirebaseAuth() は RN 向け永続化（getReactNativePersistence）を優先して初期化するため、ポップアップ
// リゾルバが自動登録されない場合がある。signInWithPopup の第3引数に明示して確実に動作させる
// （reviewer指摘: 省略時に auth/argument-error 相当で失敗するリスク）。
export async function signInWithGoogleWeb(): Promise<AuthUser> {
  const credential = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider(), browserPopupRedirectResolver);
  return toAuthUser(credential.user);
}
