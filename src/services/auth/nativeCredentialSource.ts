import type { AccountLinkKind, OAuthCredentialInput, OAuthCredentialSource } from './types';
import { AuthLinkError, linkKindLabel } from './types';

// ネイティブのサインインUI（Apple/Google）から資格情報を取得する OAuthCredentialSource の中核実装。
//
// 実際のネイティブモジュール（expo-apple-authentication / expo-crypto / @react-native-google-signin）は
// 依存注入（NativeSignInDeps）で受け取り、このファイルには **ネイティブ import を持たせない**。
// これにより、
//   - Expo Go 既定バンドルにネイティブモジュールを引き込まない（本ファイルは配布ビルドの
//     nativeCredentialSourceInstall.ts からのみ組み立てられる）
//   - nonce 生成・SHA256・資格情報の組み立て・キャンセル/失敗の AuthLinkError 写像を
//     ネイティブ非依存で単体テストできる
// を両立する（firebaseAuthProvider が Firebase 依存を閉じ込めるのと同じ方針）。
//
// プライバシー: idToken / rawNonce / accessToken は機微情報。**一切ログ出力しない**（constraints.md）。

/** Apple サインイン（expo-apple-authentication）から得る最小限の結果。 */
export interface AppleSignInResult {
  identityToken: string | null;
}

/** Google サインイン（@react-native-google-signin）から得る最小限の結果。 */
export interface GoogleSignInResult {
  idToken: string | null;
  accessToken?: string | null;
}

/** ネイティブサインインUIの操作。配布ビルドで実モジュールを束ねて渡す（nativeCredentialSourceInstall.ts）。 */
export interface NativeSignInDeps {
  /** Apple サインイン手段。iOS 以外／未対応環境では null。 */
  apple: {
    /** この端末で Apple サインインが使えるか（iOS かつ利用可能）。 */
    isAvailable(): boolean;
    /** SHA256 済み nonce を渡してサインインし、identityToken を得る。 */
    signIn(hashedNonce: string): Promise<AppleSignInResult>;
  } | null;
  /** Google サインイン手段。webClientId 未設定／未対応環境では null。 */
  google: {
    /** この端末で Google サインインが使えるか（webClientId 設定済み）。 */
    isAvailable(): boolean;
    signIn(): Promise<GoogleSignInResult>;
  } | null;
  /** ランダムな生 nonce を作る（Apple の replay 対策。Firebase へはこの生値を渡す）。 */
  generateRawNonce(): string;
  /** 生 nonce を SHA256（16進文字列）にする（Apple へはこのハッシュを渡す）。 */
  sha256Hex(input: string): Promise<string>;
  /** ネイティブUIのキャンセルを表すエラー/レスポンスか（プロバイダ非依存で判定）。 */
  isCancellation(err: unknown): boolean;
}

function unavailableError(kind: AccountLinkKind): AuthLinkError {
  return new AuthLinkError(
    'unavailable',
    `${linkKindLabel(kind)} サインインはこの環境では利用できません（対応した開発ビルドが必要です）。`,
  );
}

async function getAppleCredential(deps: NativeSignInDeps): Promise<OAuthCredentialInput> {
  if (!deps.apple || !deps.apple.isAvailable()) {
    throw unavailableError('apple');
  }
  // Apple: 生 nonce を作り、その SHA256 をネイティブUIへ渡す。Firebase へは生 nonce を渡す（rawNonce）。
  const rawNonce = deps.generateRawNonce();
  const hashedNonce = await deps.sha256Hex(rawNonce);
  const result = await deps.apple.signIn(hashedNonce);
  if (!result.identityToken) {
    throw new AuthLinkError('unknown', 'Apple から資格情報（identityToken）を取得できませんでした。');
  }
  return { kind: 'apple', idToken: result.identityToken, rawNonce };
}

async function getGoogleCredential(deps: NativeSignInDeps): Promise<OAuthCredentialInput> {
  if (!deps.google || !deps.google.isAvailable()) {
    throw unavailableError('google');
  }
  const result = await deps.google.signIn();
  if (!result.idToken) {
    throw new AuthLinkError('unknown', 'Google から資格情報（idToken）を取得できませんでした。');
  }
  return { kind: 'google', idToken: result.idToken, accessToken: result.accessToken ?? undefined };
}

// 注入された NativeSignInDeps から OAuthCredentialSource を組み立てる。
export function createNativeCredentialSource(deps: NativeSignInDeps): OAuthCredentialSource {
  return {
    isAvailable(kind: AccountLinkKind): boolean {
      if (kind === 'apple') return !!deps.apple && deps.apple.isAvailable();
      return !!deps.google && deps.google.isAvailable();
    },
    async getCredential(kind: AccountLinkKind): Promise<OAuthCredentialInput> {
      try {
        return kind === 'apple' ? await getAppleCredential(deps) : await getGoogleCredential(deps);
      } catch (err) {
        // 既に写像済み（unavailable / unknown 等）はそのまま通す。
        if (err instanceof AuthLinkError) throw err;
        // ユーザーによるキャンセルは静かに扱えるよう 'cancelled' に写像する。
        if (deps.isCancellation(err)) {
          throw new AuthLinkError('cancelled', `${linkKindLabel(kind)} サインインをキャンセルしました。`);
        }
        // idToken/rawNonce/accessToken はログしない。ネイティブSDKのサインインエラーは
        // 日記本文・uid を含まないため message も診断用にログする（Firestore エラーとは異なる）。
        console.warn(
          'native credential sign-in failed',
          kind,
          (err as { code?: string })?.code,
          (err as Error)?.name,
          (err as Error)?.message,
        );
        throw new AuthLinkError('unknown', `${linkKindLabel(kind)} サインインに失敗しました。再度お試しください。`);
      }
    },
  };
}
