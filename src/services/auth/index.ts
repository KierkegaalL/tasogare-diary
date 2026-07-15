import type { AccountLinkKind, AuthProvider } from './types';
import { localAuthProvider } from './localAuthProvider';
import { getCredentialSource } from './credentialSource';
import { isFirebaseConfigured } from '../firebase/config';
import { shouldUseNativeFirebase } from '../firebase/nativeFirebaseFlag';

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
// さらにネイティブ Firebase フラグ有効時（開発/配布ビルドのみ・Web/Expo Go 既定は false）は
// nativeFirebaseAuthProvider を動的 require する（ネイティブモジュールを Expo Go バンドルに
// 引き込まないため。migration-react-native-firebase.md 第3章）。
export function getAuthProvider(): AuthProvider {
  if (!isFirebaseConfigured) return localAuthProvider;
  if (shouldUseNativeFirebase()) {
    const install =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./nativeFirebaseAuthProviderInstall') as typeof import('./nativeFirebaseAuthProviderInstall');
    return install.nativeFirebaseAuthProvider;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firebaseAuthProvider') as typeof import('./firebaseAuthProvider'))
    .firebaseAuthProvider;
}

// 匿名→Apple/Google リンク昇格が今この環境で実行可能か。
// Firebase 設定済み・プロバイダが linkWith 対応・かつネイティブ資格情報ソースが提供されている場合のみ true。
// 既定（Expo Go）はネイティブソース未提供のため false（UI 導線を出さない判断に使う）。
export function canLinkAccount(kind: AccountLinkKind): boolean {
  if (!isFirebaseConfigured) return false;
  if (!getAuthProvider().linkWith) return false;
  return getCredentialSource().isAvailable(kind);
}
