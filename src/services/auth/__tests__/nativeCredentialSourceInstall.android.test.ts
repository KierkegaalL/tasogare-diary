// Android では iosClientId が不要（GoogleService-Info.plist 相当の判定分岐が iOS 専用）であることを
// 検証する。Platform.OS は jest.mock でファイル単位固定されるため、iOS 前提の
// nativeCredentialSourceInstall.test.ts とは別ファイルに分離する。
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { getCredentialSource, resetCredentialSource } from '../credentialSource';
import { installNativeCredentialSource } from '../nativeCredentialSourceInstall';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
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

const googleConfigure = GoogleSignin.configure as jest.Mock;

afterEach(() => {
  resetCredentialSource();
  jest.clearAllMocks();
});

describe('installNativeCredentialSource（Android）', () => {
  it('webClientId のみで configure され利用可能になる（iosClientId は要求しない）', async () => {
    await installNativeCredentialSource({ googleWebClientId: 'web-client-id' });

    expect(googleConfigure).toHaveBeenCalledWith({ webClientId: 'web-client-id' });
    expect(getCredentialSource().isAvailable('google')).toBe(true);
  });
});
