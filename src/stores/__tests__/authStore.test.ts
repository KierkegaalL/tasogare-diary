import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from '../authStore';
import { localAuthProvider } from '../../services/auth/localAuthProvider';
import * as authModule from '../../services/auth';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Web版（'needs-connect'）のテスト用: 既定は実装を素通しし、個々のテストでのみ差し替える。
jest.mock('../../services/auth', () => {
  const actual = jest.requireActual('../../services/auth');
  return { ...actual, getAuthProvider: jest.fn(actual.getAuthProvider) };
});

// isFirebaseConfigured は const エクスポートのため、getter 付きモックで動的に切り替え可能にする
// （SettingsScreen.test.tsx の isPairingAvailable と同じ方式）。
let mockFirebaseConfigured = false;
jest.mock('../../services/firebase/config', () => ({
  get isFirebaseConfigured() {
    return mockFirebaseConfigured;
  },
  firebaseConfig: {},
}));

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

  it('signOut失敗時は例外をrethrowしつつstatusをerrorにする（呼び出し元が成功/失敗を判別できるように）', async () => {
    // アカウント削除直後の再匿名化失敗を「削除自体が失敗した」と誤表示しないための挙動（reviewer指摘）。
    await store().initialize();
    const signOutSpy = jest.spyOn(localAuthProvider, 'signOut').mockRejectedValueOnce(new Error('boom'));

    await expect(store().signOut()).rejects.toThrow('boom');
    expect(store().status).toBe('error');
    expect(store().user).toBeNull();

    signOutSpy.mockRestore();
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

// Web版（Platform.OS === 'web' かつ Firebase 設定済み）専用の 'needs-connect' 分岐。
// ユーザー指摘: Webとモバイルで同じ日記を見られるようにするため、既存セッションが無い間は
// 自動で匿名セッションを発行せず連携画面（WebConnectGate）へ誘導する。
describe('authStore — Web版（needs-connect）', () => {
  const originalOS = Platform.OS;
  const fakeProvider = {
    init: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  };

  beforeEach(() => {
    useAuthStore.setState({ user: null, status: 'loading' });
    mockFirebaseConfigured = true;
    Object.defineProperty(Platform, 'OS', { get: () => 'web' });
    fakeProvider.init.mockReset();
    fakeProvider.signIn.mockReset();
    fakeProvider.signOut.mockReset();
    (authModule.getAuthProvider as jest.Mock).mockReturnValue(fakeProvider);
  });

  afterEach(() => {
    mockFirebaseConfigured = false;
    Object.defineProperty(Platform, 'OS', { get: () => originalOS });
    (authModule.getAuthProvider as jest.Mock).mockReset();
  });

  it('既存セッションが無ければ自動サインインせず needs-connect になる', async () => {
    fakeProvider.init.mockResolvedValue(null);
    await store().initialize();
    expect(store().status).toBe('needs-connect');
    expect(store().user).toBeNull();
    expect(fakeProvider.signIn).not.toHaveBeenCalled();
  });

  it('既存セッションがあれば通常どおり authenticated になる（Web でもガードしない）', async () => {
    const existing = { uid: 'u1', provider: 'anonymous' as const, isAnonymous: true };
    fakeProvider.init.mockResolvedValue(existing);
    await store().initialize();
    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(existing);
  });

  it('completeConnect で WebConnectGate から渡された user を authenticated として確定する', () => {
    const user = { uid: 'paired-1', provider: 'anonymous' as const, isAnonymous: false };
    store().completeConnect(user);
    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(user);
  });

  it('requestWebConnect はサインアウトして needs-connect に戻す', async () => {
    fakeProvider.signOut.mockResolvedValue(undefined);
    store().completeConnect({ uid: 'u2', provider: 'google', isAnonymous: false });

    await store().requestWebConnect();

    expect(fakeProvider.signOut).toHaveBeenCalledTimes(1);
    expect(store().status).toBe('needs-connect');
    expect(store().user).toBeNull();
  });

  it('requestWebConnect はサインアウト失敗時も needs-connect へ進める（連携画面への復帰を優先）', async () => {
    fakeProvider.signOut.mockRejectedValue(new Error('boom'));
    store().completeConnect({ uid: 'u3', provider: 'google', isAnonymous: false });

    await store().requestWebConnect();

    expect(store().status).toBe('needs-connect');
    expect(store().user).toBeNull();
  });
});
