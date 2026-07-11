import type { AccountLinkKind, AuthProvider } from './types';
import { localAuthProvider } from './localAuthProvider';
import { getCredentialSource } from './credentialSource';
import { isFirebaseConfigured } from '../firebase/config';

export type {
  AuthProvider,
  AuthUser,
  AuthProviderKind,
  AccountLinkKind,
  AuthLinkErrorCode,
  OAuthCredentialInput,
  OAuthCredentialSource,
} from './types';
export { AuthLinkError, linkKindLabel } from './types';
export { setCredentialSource, resetCredentialSource } from './credentialSource';

// 有効なプロバイダを選択する。Firebase 未設定時はローカル匿名プロバイダ。
// Firebase 設定時のみ firebaseAuthProvider を読み込む（未設定時は firebase を実行/バンドルしない）。
export function getAuthProvider(): AuthProvider {
  if (!isFirebaseConfigured) return localAuthProvider;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firebaseAuthProvider') as typeof import('./firebaseAuthProvider')).firebaseAuthProvider;
}

// 匿名→Apple/Google リンク昇格が今この環境で実行可能か。
// Firebase 設定済み・プロバイダが linkWith 対応・かつネイティブ資格情報ソースが提供されている場合のみ true。
// 既定（Expo Go）はネイティブソース未提供のため false（UI 導線を出さない判断に使う）。
export function canLinkAccount(kind: AccountLinkKind): boolean {
  if (!isFirebaseConfigured) return false;
  if (!getAuthProvider().linkWith) return false;
  return getCredentialSource().isAvailable(kind);
}
