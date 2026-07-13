// firebaseAuthProvider.linkWith の単体テスト。firebase/auth と firebase/app をモックし、
// 資格情報ソースはフェイクを注入する（ネイティブ依存なし）。
import * as firebaseAuth from 'firebase/auth';

import { firebaseAuthProvider, buildFirebaseCredential } from '../firebaseAuthProvider';
import { setCredentialSource, resetCredentialSource } from '../credentialSource';
import { AuthLinkError } from '../types';
import type { OAuthCredentialSource } from '../types';
import { getFirebaseAuth } from '../../firebase/app';

// ファクトリは jest 以外の外部変数を参照しない（babel-plugin-jest-hoist 制約）。
// mock 本体はインポート済みモジュール経由で取り出して設定する。
jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: {
    credential: (idToken: string, accessToken?: string) => ({ providerId: 'google.com', idToken, accessToken }),
  },
  OAuthProvider: class {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    credential(opts: { idToken: string; rawNonce?: string }) {
      return { providerId: this.id, ...opts };
    }
  },
  linkWithCredential: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('../../firebase/app', () => ({ getFirebaseAuth: jest.fn() }));

const mockLinkWithCredential = firebaseAuth.linkWithCredential as jest.Mock;
const mockGetFirebaseAuth = getFirebaseAuth as jest.Mock;

const setCurrentUser = (currentUser: unknown) => mockGetFirebaseAuth.mockReturnValue({ currentUser });

const fakeSource = (): OAuthCredentialSource => ({
  isAvailable: () => true,
  getCredential: async (kind) => ({ kind, idToken: 'id-token', rawNonce: 'nonce' }),
});

beforeEach(() => {
  mockLinkWithCredential.mockReset();
  mockGetFirebaseAuth.mockReset();
  setCurrentUser(null);
  resetCredentialSource();
});

afterEach(() => resetCredentialSource());

describe('buildFirebaseCredential', () => {
  it('google は GoogleAuthProvider.credential を使う', () => {
    expect(buildFirebaseCredential({ kind: 'google', idToken: 'g', accessToken: 'a' })).toMatchObject({
      providerId: 'google.com',
      idToken: 'g',
      accessToken: 'a',
    });
  });

  it('apple は OAuthProvider(apple.com) に idToken/rawNonce を渡す', () => {
    expect(buildFirebaseCredential({ kind: 'apple', idToken: 'a', rawNonce: 'n' })).toMatchObject({
      providerId: 'apple.com',
      idToken: 'a',
      rawNonce: 'n',
    });
  });
});

describe('firebaseAuthProvider.linkWith', () => {
  it('匿名ユーザーを昇格し、provider=kind・uid 維持で返す', async () => {
    const currentUser = { uid: 'anon-1', isAnonymous: true, displayName: null };
    setCurrentUser(currentUser);
    setCredentialSource(fakeSource());
    mockLinkWithCredential.mockResolvedValue({ user: { uid: 'anon-1', displayName: 'ryu' } });

    const user = await firebaseAuthProvider.linkWith!('google');

    expect(user).toEqual({ uid: 'anon-1', provider: 'google', displayName: 'ryu', isAnonymous: false });
    // 現在ユーザーと組み立てた資格情報で linkWithCredential が呼ばれる。
    expect(mockLinkWithCredential).toHaveBeenCalledWith(
      currentUser,
      expect.objectContaining({ providerId: 'google.com' }),
    );
  });

  it('セッションが無ければ no-anonymous-session（資格情報も取りに行かない）', async () => {
    setCurrentUser(null);
    const src = fakeSource();
    const spy = jest.spyOn(src, 'getCredential');
    setCredentialSource(src);

    await expect(firebaseAuthProvider.linkWith!('apple')).rejects.toMatchObject({ code: 'no-anonymous-session' });
    expect(spy).not.toHaveBeenCalled();
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });

  it('既に恒久アカウント（非匿名）なら already-linked', async () => {
    setCurrentUser({ uid: 'u', isAnonymous: false, displayName: null });
    setCredentialSource(fakeSource());
    await expect(firebaseAuthProvider.linkWith!('google')).rejects.toMatchObject({ code: 'already-linked' });
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });

  it('資格情報ソース未対応（unavailable）はそのまま伝播する', async () => {
    setCurrentUser({ uid: 'anon-1', isAnonymous: true, displayName: null });
    // 既定（unavailable）のまま。
    await expect(firebaseAuthProvider.linkWith!('apple')).rejects.toMatchObject({ code: 'unavailable' });
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });

  it('linkWithCredential の credential-already-in-use を AuthLinkError へ写像する', async () => {
    setCurrentUser({ uid: 'anon-1', isAnonymous: true, displayName: null });
    setCredentialSource(fakeSource());
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/credential-already-in-use' });

    const rejection = await firebaseAuthProvider.linkWith!('google').catch((e: unknown) => e);
    expect(rejection).toBeInstanceOf(AuthLinkError);
    expect((rejection as AuthLinkError).code).toBe('credential-already-in-use');
  });
});
