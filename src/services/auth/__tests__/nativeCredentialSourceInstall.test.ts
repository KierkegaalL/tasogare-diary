// 実ネイティブモジュールをモックして、install グルーが実モジュールを NativeSignInDeps に
// 正しく束ね、OAuthCredentialSource として登録することを検証する。
// （jest.mock は babel-plugin-jest-hoist で import 群より上へ巻き上げられる。factory は out-of-scope
//  変数を参照できないため、モックは import 済みモジュール経由で取得する。）
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { getCredentialSource, resetCredentialSource, unavailableCredentialSource } from '../credentialSource';
import { installNativeCredentialSource } from '../nativeCredentialSourceInstall';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array([1, 2, 3])),
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    getTokens: jest.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));

const appleIsAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;
const appleSignIn = AppleAuthentication.signInAsync as jest.Mock;
const googleConfigure = GoogleSignin.configure as jest.Mock;
const googleSignIn = GoogleSignin.signIn as jest.Mock;
const googleGetTokens = GoogleSignin.getTokens as jest.Mock;

describe('installNativeCredentialSource', () => {
  afterEach(() => {
    resetCredentialSource();
    jest.clearAllMocks();
  });

  it('登録後、既定の unavailable ソースから差し替わる', async () => {
    appleIsAvailable.mockResolvedValue(true);
    await installNativeCredentialSource({ googleWebClientId: 'web-client-id' });
    expect(getCredentialSource()).not.toBe(unavailableCredentialSource);
  });

  describe('Apple', () => {
    it('iOS かつ isAvailableAsync=true で利用可能・SHA256 済み nonce で署名し rawNonce を返す', async () => {
      appleIsAvailable.mockResolvedValue(true);
      appleSignIn.mockResolvedValue({ identityToken: 'apple-tok' });

      await installNativeCredentialSource();
      const src = getCredentialSource();
      expect(src.isAvailable('apple')).toBe(true);

      const cred = await src.getCredential('apple');
      // getRandomBytes([1,2,3]) → 16進 '010203' が生 nonce。
      expect(cred).toEqual({ kind: 'apple', idToken: 'apple-tok', rawNonce: '010203' });
      // ネイティブUIへ渡すのは SHA256 済み nonce。氏名/メールは要求しない（最小権限）。
      expect(appleSignIn).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'hashed-nonce', requestedScopes: [] }));
    });

    it('isAvailableAsync=false なら利用不可', async () => {
      appleIsAvailable.mockResolvedValue(false);
      await installNativeCredentialSource();
      expect(getCredentialSource().isAvailable('apple')).toBe(false);
    });
  });

  describe('Google', () => {
    it('webClientId 指定で configure され利用可能・idToken/accessToken を返す', async () => {
      appleIsAvailable.mockResolvedValue(true);
      googleSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'g-tok' } });
      googleGetTokens.mockResolvedValue({ idToken: 'g-tok', accessToken: 'g-acc' });

      await installNativeCredentialSource({ googleWebClientId: 'web-client-id' });
      expect(googleConfigure).toHaveBeenCalledWith({ webClientId: 'web-client-id' });

      const src = getCredentialSource();
      expect(src.isAvailable('google')).toBe(true);
      await expect(src.getCredential('google')).resolves.toEqual({
        kind: 'google',
        idToken: 'g-tok',
        accessToken: 'g-acc',
      });
    });

    it('webClientId 未指定なら利用不可（configure しない）', async () => {
      appleIsAvailable.mockResolvedValue(true);
      await installNativeCredentialSource({});
      expect(googleConfigure).not.toHaveBeenCalled();
      expect(getCredentialSource().isAvailable('google')).toBe(false);
    });

    it('キャンセル（type!=success）は AuthLinkError("cancelled")', async () => {
      appleIsAvailable.mockResolvedValue(true);
      googleSignIn.mockResolvedValue({ type: 'cancelled' });

      await installNativeCredentialSource({ googleWebClientId: 'web-client-id' });
      await expect(getCredentialSource().getCredential('google')).rejects.toMatchObject({
        name: 'AuthLinkError',
        code: 'cancelled',
      });
    });
  });
});
