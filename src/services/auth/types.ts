// 認証の抽象。実装（ローカル匿名 / Firebase）を差し替え可能にする。
export type AuthProviderKind = 'local' | 'apple' | 'google';

export interface AuthUser {
  uid: string;
  provider: AuthProviderKind;
  displayName?: string;
}

export interface AuthProvider {
  /** 既存セッションを復元する。無ければ null。 */
  init(): Promise<AuthUser | null>;
  /** サインイン（ローカルプロバイダでは匿名IDを発行）。 */
  signIn(): Promise<AuthUser>;
  /** サインアウト。 */
  signOut(): Promise<void>;
}
