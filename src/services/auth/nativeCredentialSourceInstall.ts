import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { setCredentialSource } from './credentialSource';
import { createNativeCredentialSource, type NativeSignInDeps } from './nativeCredentialSource';

// 配布ビルド（開発ビルド）で、ネイティブのサインインUI実装を OAuthCredentialSource として差し込むグルー。
//
// このファイルは **Expo Go 既定の起動パス（App.tsx）からは import しない**。ネイティブモジュール
// （expo-apple-authentication / @react-native-google-signin）は Metro が静的に解決するため、
// import すると Expo Go バンドルへ引き込まれてしまう。配布ビルドのエントリでのみ本モジュールを
// import し、起動時に installNativeCredentialSource() を呼ぶ（environments.md / web/README.md）。
//
// nonce/SHA256/資格情報の組み立て・エラー写像は nativeCredentialSource.ts（ネイティブ非依存）側にあり、
// ここは実モジュールを NativeSignInDeps に束ねるだけの薄いグルー。

// 16進のランダム生 nonce（Apple の replay 対策。Firebase へはこの生値を rawNonce として渡す）。
function generateRawNonce(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Apple の ERR_REQUEST_CANCELED / Google の SIGN_IN_CANCELLED を横断で判定する。
function isCancellation(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  return code === 'ERR_REQUEST_CANCELED' || code === String(statusCodes.SIGN_IN_CANCELLED);
}

export interface InstallNativeCredentialSourceOptions {
  /** Google サインインの webClientId（Firebase 用 idToken 取得に必須）。未指定なら env から読む。 */
  googleWebClientId?: string;
  /** iOS の Google サインインで必須の iosClientId。未指定なら env から読む（Android では不要）。 */
  googleIosClientId?: string;
}

// ネイティブ実装を OAuthCredentialSource として登録する。開発ビルドの起動時に一度呼ぶ。
// 未対応（Apple 非 iOS / Google webClientId 未設定）の手段は isAvailable() が false を返し、
// canLinkAccount() 経由で UI 導線が出ない。
export async function installNativeCredentialSource(
  options: InstallNativeCredentialSourceOptions = {},
): Promise<void> {
  const googleWebClientId = options.googleWebClientId ?? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = options.googleIosClientId ?? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  // Apple: iOS かつ端末が対応している場合のみ利用可能。判定は起動時に一度確定させる。
  // isAvailableAsync() は entitlement（com.apple.developer.applesignin）の有無を見ず OS対応のみで
  // true を返す（app.config.ts で無料 Apple ID 運用のため entitlement を外していても true になる）。
  // そのため EXPO_PUBLIC_APPLE_SIGNIN_ENABLED（app.config.ts と同一フラグ）でも明示的にガードし、
  // 「表示されるが押すと必ず失敗するボタン」を防ぐ。
  const appleSignInEnabled =
    process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === '1' ||
    process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === 'true';
  const appleAvailable =
    appleSignInEnabled &&
    Platform.OS === 'ios' &&
    (await AppleAuthentication.isAvailableAsync().catch(() => false));

  // Google: webClientId が要る（Firebase 用 idToken を得るため）。
  // iOS はさらに iosClientId が必須（GoogleService-Info.plist を使わない構成のため。未指定だと
  // RNGoogleSignin が「failed to determine clientID」で configure() 時点でクラッシュする）。
  const googleConfigured =
    Boolean(googleWebClientId) && (Platform.OS !== 'ios' || Boolean(googleIosClientId));
  let googleAvailable = false;
  if (googleConfigured) {
    try {
      GoogleSignin.configure({
        webClientId: googleWebClientId,
        ...(Platform.OS === 'ios' ? { iosClientId: googleIosClientId } : {}),
      });
      googleAvailable = true;
    } catch {
      googleAvailable = false;
    }
  }

  const deps: NativeSignInDeps = {
    apple: {
      isAvailable: () => appleAvailable,
      signIn: async (hashedNonce: string) => {
        // identityToken のみ使うため、氏名/メールは要求しない（constraints.md の最小権限）。
        // 将来 displayName 等が要る場合のみ requestedScopes に FULL_NAME/EMAIL を足す。
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [],
          nonce: hashedNonce,
        });
        return { identityToken: credential.identityToken };
      },
    },
    google: {
      isAvailable: () => googleAvailable,
      signIn: async () => {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (response.type !== 'success') {
          // v16 の新レスポンスはキャンセルを例外ではなく { type: 'cancelled' } で返す。
          // 横断のキャンセル判定に載せるため、code 付きエラーへ変換して投げ直す。
          const cancelled = new Error('google-sign-in-cancelled') as Error & { code?: string };
          cancelled.code = String(statusCodes.SIGN_IN_CANCELLED);
          throw cancelled;
        }
        // accessToken は getTokens から得る（signIn の User には idToken のみ）。
        const tokens = await GoogleSignin.getTokens().catch(() => null);
        return { idToken: response.data.idToken, accessToken: tokens?.accessToken };
      },
    },
    generateRawNonce,
    sha256Hex: (input: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
    isCancellation,
  };

  setCredentialSource(createNativeCredentialSource(deps));
}
