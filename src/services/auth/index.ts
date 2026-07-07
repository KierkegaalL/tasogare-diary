import type { AuthProvider } from './types';
import { localAuthProvider } from './localAuthProvider';
import { isFirebaseConfigured } from '../firebase/config';

export type { AuthProvider, AuthUser, AuthProviderKind } from './types';

// 有効なプロバイダを選択する。Firebase 未設定時はローカル匿名プロバイダ。
// Firebase 設定時のみ firebaseAuthProvider を読み込む（未設定時は firebase を実行/バンドルしない）。
export function getAuthProvider(): AuthProvider {
  if (!isFirebaseConfigured) return localAuthProvider;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firebaseAuthProvider') as typeof import('./firebaseAuthProvider')).firebaseAuthProvider;
}
