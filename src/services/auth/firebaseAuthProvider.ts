import type { AuthProvider } from './types';

// Firebase 認証プロバイダ（スタブ）。
// TODO(Phase2): firebase/auth を用いた Apple/Google サインインを実装する。
//   - 前提: Firebase プロジェクトの認証情報（firebase/config.ts）＋ ネイティブ認証のための開発ビルド。
//   - Expo Go では Apple/Google のネイティブサインインは動作しないため、Development Build へ移行する。
//   - サインイン結果の uid で Firestore（entries/messages）をスコープする（次の Firestore ステップ）。
const notImplemented = async (): Promise<never> => {
  throw new Error('firebaseAuthProvider is not implemented yet (Phase2: 認証情報＋開発ビルドが必要)');
};

export const firebaseAuthProvider: AuthProvider = {
  init: notImplemented,
  signIn: notImplemented,
  signOut: notImplemented,
};
