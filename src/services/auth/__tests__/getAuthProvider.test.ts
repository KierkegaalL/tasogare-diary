import { getAuthProvider } from '../index';
import { localAuthProvider } from '../localAuthProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// firebase を require したら失敗させ、未設定時に読み込まれないことを保証する。
jest.mock('firebase/app', () => {
  throw new Error('firebase must not be loaded when unconfigured');
});
jest.mock('firebase/auth', () => {
  throw new Error('firebase must not be loaded when unconfigured');
});

describe('getAuthProvider（遅延読込の回帰テスト）', () => {
  it('Firebase 未設定時はローカルプロバイダを返し、firebase を読み込まない', () => {
    // テスト環境では EXPO_PUBLIC_FIREBASE_* 未設定 → isFirebaseConfigured=false。
    // firebase/* を require する経路に入らないため、上の mock（throw）は発火しない。
    expect(getAuthProvider()).toBe(localAuthProvider);
  });
});
