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
});
