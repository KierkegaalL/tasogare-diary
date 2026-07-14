// 実ネイティブモジュール（@react-native-firebase/auth）をモックして、install グルーが実モジュールを
// NativeAuthBinding / MigrationFlagStore に正しく束ねていることを、公開 AuthProvider 経由で検証する。
// （移行ブリッジ本体のロジックは nativeFirebaseAuthProvider.test.ts でネイティブ非依存に検証済み。
//  本テストは「結線ミス」＝onAuthStateChanged の解除漏れ・AsyncStorage キーの typo 等を検知する。）
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { nativeFirebaseAuthProvider } from '../nativeFirebaseAuthProviderInstall';
import { setCredentialSource, resetCredentialSource } from '../credentialSource';
import type { OAuthCredentialSource } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// JS SDK プロバイダ（firebaseAuthProvider）は実 ESM の firebase/auth を読み込むため、結線テストの
// 対象外である本テストではモックする（ブリッジの JS 経路は nativeFirebaseAuthProvider.test.ts で検証済み）。
jest.mock('../firebaseAuthProvider', () => ({
  firebaseAuthProvider: { init: jest.fn(), getIdToken: jest.fn(), signOut: jest.fn() },
}));
jest.mock('@react-native-firebase/auth', () => {
  const api = {
    onAuthStateChanged: jest.fn(),
    signInAnonymously: jest.fn(),
    signInWithCustomToken: jest.fn(),
    signOut: jest.fn(async () => undefined),
    currentUser: null as null | {
      isAnonymous: boolean;
      getIdToken: () => Promise<string>;
      linkWithCredential: jest.Mock;
    },
  };
  const authFn = jest.fn(() => api);
  // GoogleAuthProvider.credential / OAuthProvider('apple.com').credential の結線を検証するための最小モック。
  const GoogleAuthProvider = {
    credential: jest.fn((idToken: string, accessToken?: string) => ({
      providerId: 'google.com',
      idToken,
      accessToken,
    })),
  };
  class OAuthProvider {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    credential(opts: { idToken: string; rawNonce?: string }) {
      return { providerId: this.id, ...opts };
    }
  }
  return {
    __esModule: true,
    default: Object.assign(authFn, { GoogleAuthProvider, OAuthProvider }),
  };
});

// モック API を取り出す（auth() は常に同じインスタンスを返す）。
const authApi = (auth as unknown as jest.Mock)() as {
  onAuthStateChanged: jest.Mock;
  signInAnonymously: jest.Mock;
  signInWithCustomToken: jest.Mock;
  signOut: jest.Mock;
  currentUser: null | {
    isAnonymous: boolean;
    getIdToken: () => Promise<string>;
    linkWithCredential: jest.Mock;
  };
};

const MIGRATED_KEY = 'tasogare-native-firebase-migrated';

const fakeGoogleSource = (): OAuthCredentialSource => ({
  isAvailable: () => true,
  getCredential: async () => ({ kind: 'google', idToken: 'id-token', accessToken: 'access-token' }),
});

afterEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  authApi.currentUser = null;
  resetCredentialSource();
});

describe('nativeFirebaseAuthProviderInstall（実モジュール束ね）', () => {
  it('signIn: auth().signInAnonymously を呼び、ユーザーを写像し、移行済みフラグ（AsyncStorage）を立てる', async () => {
    authApi.signInAnonymously.mockResolvedValue({
      user: { uid: 'anon-uid', isAnonymous: true, displayName: null },
    });

    const user = await nativeFirebaseAuthProvider.signIn();

    expect(authApi.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(user).toEqual({
      uid: 'anon-uid',
      provider: 'anonymous',
      displayName: undefined,
      isAnonymous: true,
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(MIGRATED_KEY, '1');
  });

  it('init（移行済み）: onAuthStateChanged を一度だけ待って解除し、復元ユーザーを返す', async () => {
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
    const unsubscribe = jest.fn();
    // 実 Firebase の onAuthStateChanged はリスナー登録後に非同期でコールバックする（unsubscribe を
    // 返してから発火）。同期発火させると install 側の unsubscribe 参照が未定義になるため、実挙動に
    // 合わせてマイクロタスクで遅延発火させる。
    authApi.onAuthStateChanged.mockImplementation((cb: (u: unknown) => void) => {
      void Promise.resolve().then(() =>
        cb({ uid: 'restored', isAnonymous: false, displayName: 'ひかり' }),
      );
      return unsubscribe;
    });

    const user = await nativeFirebaseAuthProvider.init();

    expect(user).toEqual({
      uid: 'restored',
      provider: 'anonymous',
      displayName: 'ひかり',
      isAnonymous: false,
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1); // 解除漏れ（リスナー残留）を検知
  });

  it('getIdToken: currentUser の getIdToken を返す。未サインインなら throw', async () => {
    authApi.currentUser = {
      isAnonymous: true,
      getIdToken: jest.fn(async () => 'native-token'),
      linkWithCredential: jest.fn(),
    };
    expect(await nativeFirebaseAuthProvider.getIdToken()).toBe('native-token');

    authApi.currentUser = null;
    await expect(nativeFirebaseAuthProvider.getIdToken()).rejects.toThrow();
  });

  it('signOut: auth().signOut を呼ぶ', async () => {
    await nativeFirebaseAuthProvider.signOut();
    expect(authApi.signOut).toHaveBeenCalledTimes(1);
  });

  it('linkWith(google): GoogleAuthProvider.credential を組み立て currentUser.linkWithCredential を呼ぶ', async () => {
    setCredentialSource(fakeGoogleSource());
    const linkWithCredential = jest.fn(async () => ({
      user: { uid: 'anon-1', isAnonymous: false, displayName: null },
    }));
    authApi.currentUser = { isAnonymous: true, getIdToken: jest.fn(), linkWithCredential };

    const user = await nativeFirebaseAuthProvider.linkWith!('google');

    expect(linkWithCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'google.com',
        idToken: 'id-token',
        accessToken: 'access-token',
      }),
    );
    expect(user).toEqual({
      uid: 'anon-1',
      provider: 'google',
      displayName: undefined,
      isAnonymous: false,
    });
  });

  it('linkWith: セッションが無ければ no-anonymous-session（linkWithCredential も呼ばれない）', async () => {
    setCredentialSource(fakeGoogleSource());
    authApi.currentUser = null;
    await expect(nativeFirebaseAuthProvider.linkWith!('google')).rejects.toMatchObject({
      code: 'no-anonymous-session',
    });
  });

  it('linkWith: 既に恒久アカウント（非匿名）なら already-linked', async () => {
    setCredentialSource(fakeGoogleSource());
    const linkWithCredential = jest.fn();
    authApi.currentUser = { isAnonymous: false, getIdToken: jest.fn(), linkWithCredential };
    await expect(nativeFirebaseAuthProvider.linkWith!('google')).rejects.toMatchObject({
      code: 'already-linked',
    });
    expect(linkWithCredential).not.toHaveBeenCalled();
  });
});
