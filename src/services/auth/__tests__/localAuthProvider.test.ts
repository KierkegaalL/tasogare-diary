import AsyncStorage from '@react-native-async-storage/async-storage';

import { localAuthProvider } from '../localAuthProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('localAuthProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('init は未サインイン時 null を返す', async () => {
    expect(await localAuthProvider.init()).toBeNull();
  });

  it('signIn は匿名 uid を発行・永続し、init で復元できる', async () => {
    const user = await localAuthProvider.signIn();
    expect(user.uid).toMatch(/^u_/);
    expect(user.provider).toBe('local');
    // Web版 SettingsScreen の連携/ログアウト出し分けが誤らないよう、常に匿名扱いにする
    // （reviewer指摘）。
    expect(user.isAnonymous).toBe(true);

    // 同一 uid を復元
    const restored = await localAuthProvider.init();
    expect(restored?.uid).toBe(user.uid);
    expect(restored?.isAnonymous).toBe(true);

    // 再サインインでも uid は変わらない
    const again = await localAuthProvider.signIn();
    expect(again.uid).toBe(user.uid);
  });

  it('signOut はセッションを消す', async () => {
    await localAuthProvider.signIn();
    await localAuthProvider.signOut();
    expect(await localAuthProvider.init()).toBeNull();
  });
});
