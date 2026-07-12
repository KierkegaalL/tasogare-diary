// nativeAuthBootstrap のゲート判定と、ゲート開閉による installNativeCredentialSource 呼び出しを検証する。
// 実ネイティブモジュール（expo-apple-authentication / @react-native-google-signin）を評価しないよう、
// 動的 require 先の nativeCredentialSourceInstall をモックする（jest.mock は babel-plugin-jest-hoist で
// import 群より上へ巻き上げられるため、ソース上は import の後に置いて import/first を満たす）。
import { installNativeCredentialSource } from '../nativeCredentialSourceInstall';
import { bootstrapNativeCredentialSource, shouldInstallNativeCredentialSource } from '../nativeAuthBootstrap';

jest.mock('../nativeCredentialSourceInstall', () => ({
  installNativeCredentialSource: jest.fn(() => Promise.resolve()),
}));

const installMock = installNativeCredentialSource as jest.MockedFunction<typeof installNativeCredentialSource>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shouldInstallNativeCredentialSource', () => {
  it("'1' / 'true'（前後空白・大小無視）を真とする", () => {
    expect(shouldInstallNativeCredentialSource('1')).toBe(true);
    expect(shouldInstallNativeCredentialSource('true')).toBe(true);
    expect(shouldInstallNativeCredentialSource(' TRUE ')).toBe(true);
  });

  it('未設定・空・その他の値は偽', () => {
    expect(shouldInstallNativeCredentialSource(undefined)).toBe(false);
    expect(shouldInstallNativeCredentialSource('')).toBe(false);
    expect(shouldInstallNativeCredentialSource('0')).toBe(false);
    expect(shouldInstallNativeCredentialSource('false')).toBe(false);
    expect(shouldInstallNativeCredentialSource('yes')).toBe(false);
  });

  it('既定は環境変数 EXPO_PUBLIC_ENABLE_NATIVE_AUTH を読む', () => {
    const original = process.env.EXPO_PUBLIC_ENABLE_NATIVE_AUTH;
    try {
      process.env.EXPO_PUBLIC_ENABLE_NATIVE_AUTH = '1';
      expect(shouldInstallNativeCredentialSource()).toBe(true);
      delete process.env.EXPO_PUBLIC_ENABLE_NATIVE_AUTH;
      expect(shouldInstallNativeCredentialSource()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_ENABLE_NATIVE_AUTH;
      else process.env.EXPO_PUBLIC_ENABLE_NATIVE_AUTH = original;
    }
  });
});

describe('bootstrapNativeCredentialSource', () => {
  it('ゲートが開いていれば installNativeCredentialSource を呼ぶ', () => {
    bootstrapNativeCredentialSource(true);
    expect(installMock).toHaveBeenCalledTimes(1);
  });

  it('ゲートが閉じていれば何もしない（Expo Go 既定）', () => {
    bootstrapNativeCredentialSource(false);
    expect(installMock).not.toHaveBeenCalled();
  });

  it('install が reject しても例外を投げない（起動を止めない）', async () => {
    installMock.mockRejectedValueOnce(new Error('boom'));
    expect(() => bootstrapNativeCredentialSource(true)).not.toThrow();
    // マイクロタスクの catch を消化する。
    await Promise.resolve();
    expect(installMock).toHaveBeenCalledTimes(1);
  });
});

describe('bootstrapNativeCredentialSource（Web）', () => {
  // Web は @react-native-google-signin / expo-apple-authentication が未実装のため対象外。
  // jest.mock('react-native', ...) はファイル全体に効いてしまうため、このケースだけ
  // jest.isolateModules + jest.doMock でサンドボックス化して Platform.OS を 'web' に固定する。
  it('Platform.OS が web ならゲートが開いていても installNativeCredentialSource を呼ばない', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { bootstrapNativeCredentialSource: bootstrapWeb } = require('../nativeAuthBootstrap');
      bootstrapWeb(true);
    });
    expect(installMock).not.toHaveBeenCalled();
  });
});
