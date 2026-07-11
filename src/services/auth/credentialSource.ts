import type { AccountLinkKind, OAuthCredentialInput, OAuthCredentialSource } from './types';
import { AuthLinkError, linkKindLabel } from './types';

// ネイティブのサインインUI（Apple/Google）から Firebase 用の資格情報を取得する差し替え可能なシーム。
//
// 既定は「この環境では未対応」。Apple サインインは expo-apple-authentication、Google は
// @react-native-google-signin / expo-auth-session 等のネイティブモジュールを要し、いずれも
// Expo Go 既定ビルドでは動かない（environments.md: 当面は配布しない前提・抽象で差し替え可能に保つ）。
// 配布時（開発ビルド）に実装を用意し、アプリ起動時に setCredentialSource で差し込む。
export const unavailableCredentialSource: OAuthCredentialSource = {
  isAvailable: () => false,
  getCredential: (kind: AccountLinkKind): Promise<OAuthCredentialInput> =>
    Promise.reject(
      new AuthLinkError(
        'unavailable',
        `${linkKindLabel(kind)} サインインはこの環境では利用できません（対応した開発ビルドが必要です）。`,
      ),
    ),
};

let current: OAuthCredentialSource = unavailableCredentialSource;

export function getCredentialSource(): OAuthCredentialSource {
  return current;
}

// 配布ビルドでネイティブ実装を差し込む。テストでもフェイクを注入するのに使う。
export function setCredentialSource(source: OAuthCredentialSource): void {
  current = source;
}

// 既定（未対応）へ戻す。テストの後片付け用。
export function resetCredentialSource(): void {
  current = unavailableCredentialSource;
}
