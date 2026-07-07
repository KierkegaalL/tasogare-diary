import { onAuthStateChanged, signInAnonymously, signOut as firebaseSignOut } from 'firebase/auth';
import type { User } from 'firebase/auth';

import type { AuthProvider, AuthUser } from './types';
import { getFirebaseAuth } from '../firebase/app';

// Firebase 匿名認証プロバイダ（Phase2）。
// 配布不要・Expo Go 可・開発ビルド不要で、実 Firebase uid を確立する。
// isFirebaseConfigured（firebase/config.ts）が true のときのみ getAuthProvider から読み込まれる。
// TODO: 将来 Apple/Google サインインを匿名アカウントへ linkWithCredential で昇格する（データ維持）。
const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  provider: 'anonymous',
  displayName: user.displayName ?? undefined,
});

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
};
