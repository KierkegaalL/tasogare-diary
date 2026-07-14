import { getEntriesRepository, getMessagesRepository } from '../index';
import { localEntriesRepository } from '../localEntriesRepository';
import { localMessagesRepository } from '../localMessagesRepository';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// firebase/@react-native-firebase を require したら失敗させ、未設定時に読み込まれないことを保証する
// （src/services/auth/__tests__/getAuthProvider.test.ts と同じ手法）。
jest.mock('firebase/app', () => {
  throw new Error('firebase must not be loaded when unconfigured');
});
jest.mock('firebase/firestore', () => {
  throw new Error('firebase must not be loaded when unconfigured');
});
jest.mock('@react-native-firebase/firestore', () => {
  throw new Error('@react-native-firebase/firestore must not be loaded when unconfigured');
});

describe('getEntriesRepository/getMessagesRepository（遅延読込の回帰テスト）', () => {
  it('Firebase 未設定時はローカルリポジトリを返し、firestore を読み込まない', () => {
    // テスト環境では EXPO_PUBLIC_FIREBASE_* 未設定 → isFirebaseConfigured=false。
    // firestore 系を require する経路に入らないため、上の mock（throw）は発火しない。
    expect(getEntriesRepository()).toBe(localEntriesRepository);
    expect(getMessagesRepository()).toBe(localMessagesRepository);
  });
});
