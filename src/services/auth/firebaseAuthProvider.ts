import {
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import type { AuthCredential, User } from 'firebase/auth';

import type { AccountLinkKind, AuthProvider, AuthUser, OAuthCredentialInput } from './types';
import { AuthLinkError, mapFirebaseLinkError } from './types';
import { getCredentialSource } from './credentialSource';
import { getFirebaseAuth } from '../firebase/app';

// Firebase 匿名認証プロバイダ（Phase2）。
// 配布不要・Expo Go 可・開発ビルド不要で、実 Firebase uid を確立する。
// isFirebaseConfigured（firebase/config.ts）が true のときのみ getAuthProvider から読み込まれる。
//
// リンク昇格（linkWith）: 匿名アカウントを Apple/Google の恒久アカウントへ linkWithCredential で
// 昇格する（uid・Firestore データを維持したまま）。ネイティブの資格情報取得は credentialSource
// シーム経由で、既定（Expo Go）では 'unavailable' になる（environments.md）。
const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  provider: 'anonymous',
  displayName: user.displayName ?? undefined,
});

// プロバイダ非依存の資格情報を Firebase の AuthCredential に組み立てる（Firebase 依存をここに閉じ込める）。
export function buildFirebaseCredential(input: OAuthCredentialInput): AuthCredential {
  if (input.kind === 'google') {
    return GoogleAuthProvider.credential(input.idToken, input.accessToken);
  }
  // Apple: OAuthProvider('apple.com') に idToken（＋ replay 対策の rawNonce）を渡す。
  return new OAuthProvider('apple.com').credential({ idToken: input.idToken, rawNonce: input.rawNonce });
}

export const firebaseAuthProvider: AuthProvider = {
  init: () =>
    new Promise<AuthUser | null>((resolve) => {
      const auth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user ? toAuthUser(user) : null);
      });
    }),
  signIn: async () => {
    const credential = await signInAnonymously(getFirebaseAuth());
    return toAuthUser(credential.user);
  },
  signOut: async () => {
    await firebaseSignOut(getFirebaseAuth());
  },
  linkWith: async (kind: AccountLinkKind): Promise<AuthUser> => {
    const currentUser = getFirebaseAuth().currentUser;
    if (!currentUser) {
      throw new AuthLinkError('no-anonymous-session', 'サインイン済みのセッションがありません。');
    }
    if (!currentUser.isAnonymous) {
      throw new AuthLinkError('already-linked', 'すでに恒久アカウントにリンク済みです。');
    }

    // ネイティブUIから資格情報を取得（未対応環境なら 'unavailable'、キャンセルなら 'cancelled' を投げる）。
    const input = await getCredentialSource().getCredential(kind);
    const credential = buildFirebaseCredential(input);

    try {
      const result = await linkWithCredential(currentUser, credential);
      return { uid: result.user.uid, provider: kind, displayName: result.user.displayName ?? undefined };
    } catch (err) {
      // 資格情報が別アカウントで使用中（credential-already-in-use）等はデータ非移行になるため、
      // 黙って別アカウントへサインインし直さず、UI へ写像したエラーを返して利用者に委ねる。
      throw mapFirebaseLinkError(kind, err);
    }
  },
};
