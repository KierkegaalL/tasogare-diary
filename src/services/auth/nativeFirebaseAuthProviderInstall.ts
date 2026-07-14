import auth from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AuthProvider, OAuthCredentialInput } from './types';
import { AuthLinkError } from './types';
import {
  createNativeFirebaseAuthProvider,
  type MigrationFlagStore,
  type NativeAuthBinding,
  type NativeFirebaseUser,
} from './nativeFirebaseAuthProvider';
import { firebaseAuthProvider } from './firebaseAuthProvider';
import { callClaudeWorker } from '../claudeWorker/client';

// ネイティブ Firebase 認証プロバイダの「実モジュール束ね」（docs/migration-react-native-firebase.md 第4章）。
//
// このファイルは @react-native-firebase/auth を **静的 import** するため、Expo Go 既定バンドルに
// ネイティブモジュールを引き込まないよう、getAuthProvider()（src/services/auth/index.ts）から
// **フラグ有効時のみ動的 require** されることを前提とする（nativeCredentialSourceInstall.ts と同方針）。

// 「移行済み」ローカルフラグの AsyncStorage キー。
const MIGRATED_KEY = 'tasogare-native-firebase-migrated';

function toNativeUser(user: FirebaseAuthTypes.User): NativeFirebaseUser {
  return { uid: user.uid, isAnonymous: user.isAnonymous, displayName: user.displayName };
}

// プロバイダ非依存の資格情報を @react-native-firebase/auth の AuthCredential に組み立てる
// （firebaseAuthProvider.ts の buildFirebaseCredential と同じ方針。ネイティブ依存をここに閉じ込める）。
function buildNativeCredential(input: OAuthCredentialInput): FirebaseAuthTypes.AuthCredential {
  if (input.kind === 'google') {
    return auth.GoogleAuthProvider.credential(input.idToken, input.accessToken);
  }
  // Apple: @react-native-firebase/auth の名前空間型は modular SDK と異なり credential(token, secret) の
  // 位置引数形式（firebase/auth の { idToken, rawNonce } オブジェクト形式とは違う）。
  return new auth.OAuthProvider('apple.com').credential(input.idToken, input.rawNonce);
}

// @react-native-firebase/auth を NativeAuthBinding へ束ねる。
const nativeBinding: NativeAuthBinding = {
  restore: () =>
    // 既存セッションの復元は onAuthStateChanged を一度だけ待つ（firebaseAuthProvider.init と同方針。
    // ネイティブ SDK の初期化完了後に currentUser が確定するため、同期の currentUser 参照より安全）。
    new Promise<NativeFirebaseUser | null>((resolve) => {
      const unsubscribe = auth().onAuthStateChanged((user) => {
        unsubscribe();
        resolve(user ? toNativeUser(user) : null);
      });
    }),
  signInAnonymously: async () => {
    const credential = await auth().signInAnonymously();
    return toNativeUser(credential.user);
  },
  signInWithCustomToken: async (customToken: string) => {
    const credential = await auth().signInWithCustomToken(customToken);
    return toNativeUser(credential.user);
  },
  getIdToken: async () => {
    const user = auth().currentUser;
    return user ? user.getIdToken() : null;
  },
  signOut: async () => {
    await auth().signOut();
  },
  getCurrentUser: () => {
    const user = auth().currentUser;
    return user ? toNativeUser(user) : null;
  },
  linkWithCredential: async (input: OAuthCredentialInput) => {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      // 呼び出し元（nativeFirebaseAuthProvider.linkWith）が getCurrentUser() で事前チェック済みのため
      // 通常到達しないが、チェックとサインインUI待機の間に外部でサインアウトされる競合に備えた防御。
      throw new AuthLinkError('no-anonymous-session', 'サインイン済みのセッションがありません。');
    }
    const credential = buildNativeCredential(input);
    const result = await currentUser.linkWithCredential(credential);
    return toNativeUser(result.user);
  },
};

// 移行済みフラグ（AsyncStorage）。
const migrationFlag: MigrationFlagStore = {
  isMigrated: async () => (await AsyncStorage.getItem(MIGRATED_KEY)) === '1',
  markMigrated: async () => {
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
  },
};

// JS SDK の ID トークンを Worker /migrateToNativeAuth に送り、同一 uid のカスタムトークンを得る。
// idToken を明示指定して呼ぶ（getAuthProvider().getIdToken() 経由だと移行中のネイティブプロバイダ自身を
// 呼び戻して再帰するため。claudeWorker/client.ts のコメント参照）。
async function mintCustomToken(jsIdToken: string): Promise<string> {
  const { customToken } = await callClaudeWorker<Record<string, never>, { customToken: string }>(
    '/migrateToNativeAuth',
    {},
    { idToken: jsIdToken },
  );
  return customToken;
}

export const nativeFirebaseAuthProvider: AuthProvider = createNativeFirebaseAuthProvider({
  native: nativeBinding,
  jsProvider: firebaseAuthProvider,
  mintCustomToken,
  migrationFlag,
});
