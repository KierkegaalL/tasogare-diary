import type { AuthProvider } from './types';
import { localAuthProvider } from './localAuthProvider';
import { firebaseAuthProvider } from './firebaseAuthProvider';
import { isFirebaseConfigured } from '../firebase/config';

export type { AuthProvider, AuthUser, AuthProviderKind } from './types';

// 有効なプロバイダを選択する。Firebase 未設定時はローカル匿名プロバイダ。
export function getAuthProvider(): AuthProvider {
  return isFirebaseConfigured ? firebaseAuthProvider : localAuthProvider;
}
