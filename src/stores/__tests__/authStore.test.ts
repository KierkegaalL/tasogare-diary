import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from '../authStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const store = () => useAuthStore.getState();

describe('authStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useAuthStore.setState({ user: null, status: 'loading' });
  });

  it('initialize で匿名ローカルユーザーが確立し authenticated になる', async () => {
    await store().initialize();
    expect(store().status).toBe('authenticated');
    expect(store().user?.uid).toBeDefined();
    expect(store().user?.provider).toBe('local');
  });

  it('signOut 後も匿名セッションを再確立し authenticated を保つ（復帰不能を防ぐ）', async () => {
    await store().initialize();
    const firstUid = store().user?.uid;
    await store().signOut();
    expect(store().status).toBe('authenticated');
    expect(store().user?.uid).toBeDefined();
    // ローカルはサインアウトで新しい匿名 uid になる
    expect(store().user?.uid).not.toBe(firstUid);
  });

  it('linkAccount はローカルプロバイダ（linkWith 非対応）では AuthLinkError(unavailable) を投げ、状態を変えない', async () => {
    await store().initialize();
    const before = store().user;
    await expect(store().linkAccount('google')).rejects.toMatchObject({ name: 'AuthLinkError', code: 'unavailable' });
    // 失敗時は user/status を変えない。
    expect(store().user).toBe(before);
    expect(store().status).toBe('authenticated');
  });
});
