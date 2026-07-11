import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type AuthProvider,
} from 'firebase/auth';

import { getFirebaseAuth } from './firebase';

// Apple/Google サインイン代替（Web / screen.md 4.2・4.7・U-13）。
// カメラ／QR ペアリングが使えない環境向けの代替サインイン導線。
// 成功時は Firebase Auth のセッションが確立し、onAuthStateChanged（useAuth）が拾って /dashboard へ遷移する。
//
// 前提: 同じ Apple/Google 資格情報が、モバイルの匿名アカウントへ linkWithCredential で
// 昇格済みのときにのみ同一 uid となり、既存の日記が表示される（恒久アカウント昇格は別タスク・
// src/services/auth/firebaseAuthProvider.ts の TODO / environments.md）。未リンクの資格情報で
// サインインすると新規（空）アカウントになる点に注意。

export type OAuthKind = 'google' | 'apple';

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** ユーザー操作によるキャンセルなど、エラー表示が不要なケースを表す。 */
    public readonly silent = false,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

function buildProvider(kind: OAuthKind): AuthProvider {
  if (kind === 'google') {
    return new GoogleAuthProvider();
  }
  // Apple は OAuthProvider('apple.com')。email/name スコープを要求する。
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

// Firebase Auth のエラーコードを日本語メッセージへ写す。
// ユーザーがポップアップを閉じた／連打した場合は silent 扱い（エラー表示しない）。
function toOAuthError(kind: OAuthKind, err: unknown): OAuthError {
  const label = kind === 'google' ? 'Google' : 'Apple';
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : 'unknown';

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return new OAuthError(code, 'サインインをキャンセルしました。', true);
    case 'auth/popup-blocked':
      return new OAuthError(
        code,
        'ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。',
      );
    case 'auth/operation-not-allowed':
      return new OAuthError(
        code,
        `${label} サインインは現在利用できません（未設定）。QR での連携をお試しください。`,
      );
    case 'auth/account-exists-with-different-credential':
      return new OAuthError(
        code,
        'このメールアドレスは別のサインイン方法で登録済みです。QR での連携をお試しください。',
      );
    case 'auth/unauthorized-domain':
      return new OAuthError(
        code,
        'このドメインは許可されていません。QR での連携をお試しください。',
      );
    case 'auth/network-request-failed':
      return new OAuthError(code, 'ネットワークエラーが発生しました。再度お試しください。');
    default:
      return new OAuthError(code, `${label} サインインに失敗しました。再度お試しください。`);
  }
}

// Apple/Google でサインインする。成功で uid を返す。失敗は OAuthError を投げる
// （silent=true はユーザーによるキャンセルで、呼び出し側はエラー表示しない想定）。
export async function signInWithProvider(kind: OAuthKind): Promise<string> {
  try {
    const credential = await signInWithPopup(getFirebaseAuth(), buildProvider(kind));
    return credential.user.uid;
  } catch (err) {
    throw toOAuthError(kind, err);
  }
}
