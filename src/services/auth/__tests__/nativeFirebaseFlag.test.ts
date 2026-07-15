import { shouldUseNativeFirebase } from '../../firebase/nativeFirebaseFlag';

describe('shouldUseNativeFirebase', () => {
  it("'1' / 'true'（前後空白・大小無視）を真とする（Web 以外）", () => {
    expect(shouldUseNativeFirebase('1', 'ios')).toBe(true);
    expect(shouldUseNativeFirebase('true', 'android')).toBe(true);
    expect(shouldUseNativeFirebase(' TRUE ', 'ios')).toBe(true);
  });

  it('未設定・空・その他の値は偽', () => {
    expect(shouldUseNativeFirebase(undefined, 'ios')).toBe(false);
    expect(shouldUseNativeFirebase('', 'ios')).toBe(false);
    expect(shouldUseNativeFirebase('0', 'ios')).toBe(false);
    expect(shouldUseNativeFirebase('false', 'ios')).toBe(false);
    expect(shouldUseNativeFirebase('yes', 'ios')).toBe(false);
  });

  it('Web はフラグが真でも常に偽（@react-native-firebase は Web 非対応）', () => {
    expect(shouldUseNativeFirebase('1', 'web')).toBe(false);
    expect(shouldUseNativeFirebase('true', 'web')).toBe(false);
  });

  it('既定は環境変数 EXPO_PUBLIC_USE_NATIVE_FIREBASE を読む', () => {
    const original = process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE;
    try {
      process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE = '1';
      expect(shouldUseNativeFirebase(undefined, 'ios')).toBe(true);
      delete process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE;
      expect(shouldUseNativeFirebase(undefined, 'ios')).toBe(false);
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE;
      else process.env.EXPO_PUBLIC_USE_NATIVE_FIREBASE = original;
    }
  });
});
