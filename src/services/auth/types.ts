// 認証の抽象。実装（ローカル匿名 / Firebase）を差し替え可能にする。
export type AuthProviderKind = 'local' | 'anonymous' | 'apple' | 'google';

// 匿名アカウントへリンク昇格できる恒久プロバイダ（environments.md「恒久アカウント昇格」）。
export type AccountLinkKind = 'apple' | 'google';

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
  /**
   * 現在の匿名アカウントを Apple/Google の恒久アカウントへリンク昇格する（uid・データ維持）。
   * 対応しないプロバイダ（ローカル匿名）では未実装（省略）。
   */
  linkWith?(kind: AccountLinkKind): Promise<AuthUser>;
}

// ---- リンク昇格（linkWithCredential）の抽象 ----

// ネイティブのサインインUI（Apple/Google）が返す、プロバイダ非依存の資格情報。
// firebaseAuthProvider 側でこれを Firebase の AuthCredential に組み立てる（Firebase 依存を閉じ込める）。
export interface OAuthCredentialInput {
  kind: AccountLinkKind;
  idToken: string;
  /** Apple の replay 対策 nonce（sha256 前の生値）。Apple では必須、Google では未使用。 */
  rawNonce?: string;
  /** Google のアクセストークン（任意）。 */
  accessToken?: string;
}

// ネイティブサインインUIから資格情報を得るシーム。既定は「この環境では未対応」。
// 配布時に expo-apple-authentication / Google サインイン等の実装へ差し替える（setCredentialSource）。
export interface OAuthCredentialSource {
  isAvailable(kind: AccountLinkKind): boolean;
  getCredential(kind: AccountLinkKind): Promise<OAuthCredentialInput>;
}

// ---- リンク昇格エラー ----

export type AuthLinkErrorCode =
  | 'unavailable' // ネイティブ資格情報ソースが未提供（Expo Go 既定ビルド等）
  | 'no-anonymous-session' // 昇格対象の匿名セッションが無い
  | 'already-linked' // すでに恒久アカウントにリンク済み
  | 'credential-already-in-use' // 資格情報が別アカウントで使用中（今の端末データは引き継がれない）
  | 'email-already-in-use' // 同一メールが別方式で登録済み
  | 'cancelled' // ユーザーがネイティブUIをキャンセル
  | 'network' // ネットワークエラー
  | 'unknown';

export class AuthLinkError extends Error {
  constructor(
    public readonly code: AuthLinkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthLinkError';
  }
}

export function linkKindLabel(kind: AccountLinkKind): string {
  return kind === 'google' ? 'Google' : 'Apple';
}

// Firebase の linkWithCredential 由来エラーを、UI 表示可能な AuthLinkError へ写像する（純関数）。
// Firebase 依存を持たず error.code の文字列だけで判定するため、単体テストしやすい。
export function mapFirebaseLinkError(kind: AccountLinkKind, err: unknown): AuthLinkError {
  const label = linkKindLabel(kind);
  const code =
    typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
  switch (code) {
    case 'auth/credential-already-in-use':
      return new AuthLinkError(
        'credential-already-in-use',
        `この ${label} アカウントは既に別のデータで使われています。この端末の日記はそのアカウントには引き継がれません。`,
      );
    case 'auth/email-already-in-use':
      return new AuthLinkError('email-already-in-use', 'このメールアドレスは別のサインイン方法で登録済みです。');
    case 'auth/provider-already-linked':
    case 'auth/credential-already-linked':
      return new AuthLinkError('already-linked', `すでに ${label} アカウントにリンク済みです。`);
    case 'auth/network-request-failed':
      return new AuthLinkError('network', 'ネットワークエラーが発生しました。オンラインで再度お試しください。');
    default:
      return new AuthLinkError('unknown', `${label} との連携に失敗しました。再度お試しください。`);
  }
}
