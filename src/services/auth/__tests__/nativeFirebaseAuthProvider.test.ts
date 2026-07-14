import { createNativeFirebaseAuthProvider } from '../nativeFirebaseAuthProvider';
import type {
  MigrationFlagStore,
  NativeAuthBinding,
  NativeFirebaseAuthDeps,
  NativeFirebaseUser,
} from '../nativeFirebaseAuthProvider';
import type { AuthProvider, AuthUser } from '../types';

// 移行ブリッジ（docs/migration-react-native-firebase.md 第4章）のロジックをネイティブ非依存で検証する。
// 実 @react-native-firebase/auth・JS SDK・Worker には触れず、注入した fake でパスを網羅する。

const nativeUser = (over: Partial<NativeFirebaseUser> = {}): NativeFirebaseUser => ({
  uid: 'native-uid',
  isAnonymous: true,
  displayName: null,
  ...over,
});

const jsUser = (over: Partial<AuthUser> = {}): AuthUser => ({
  uid: 'js-uid',
  provider: 'anonymous',
  isAnonymous: true,
  ...over,
});

function makeDeps(over: Partial<NativeFirebaseAuthDeps> = {}): {
  deps: NativeFirebaseAuthDeps;
  native: jest.Mocked<NativeAuthBinding>;
  jsProvider: jest.Mocked<Pick<AuthProvider, 'init' | 'getIdToken' | 'signOut'>>;
  mintCustomToken: jest.MockedFunction<NativeFirebaseAuthDeps['mintCustomToken']>;
  flag: jest.Mocked<MigrationFlagStore>;
} {
  const native: jest.Mocked<NativeAuthBinding> = {
    restore: jest.fn(async () => null),
    signInAnonymously: jest.fn(async () => nativeUser()),
    signInWithCustomToken: jest.fn(async (_customToken: string) => nativeUser()),
    getIdToken: jest.fn(async () => 'native-id-token'),
    signOut: jest.fn(async () => undefined),
  };
  const jsProvider: jest.Mocked<Pick<AuthProvider, 'init' | 'getIdToken' | 'signOut'>> = {
    init: jest.fn(async () => null),
    getIdToken: jest.fn(async () => 'js-id-token'),
    signOut: jest.fn(async () => undefined),
  };
  const mintCustomToken = jest.fn(async (_t: string) => 'custom-token');
  const flag: jest.Mocked<MigrationFlagStore> = {
    isMigrated: jest.fn(async () => false),
    markMigrated: jest.fn(async () => undefined),
  };
  const deps: NativeFirebaseAuthDeps = { native, jsProvider, mintCustomToken, migrationFlag: flag, ...over };
  return { deps, native, jsProvider, mintCustomToken, flag };
}

describe('nativeFirebaseAuthProvider.init（移行済み）', () => {
  it('移行済みならネイティブ復元のみ・ブリッジをスキップする', async () => {
    const { deps, native, jsProvider, flag } = makeDeps();
    flag.isMigrated.mockResolvedValue(true);
    native.restore.mockResolvedValue(nativeUser({ uid: 'restored', isAnonymous: false, displayName: 'さくら' }));

    const user = await createNativeFirebaseAuthProvider(deps).init();

    expect(user).toEqual({ uid: 'restored', provider: 'anonymous', displayName: 'さくら', isAnonymous: false });
    expect(native.restore).toHaveBeenCalledTimes(1);
    expect(jsProvider.init).not.toHaveBeenCalled();
    expect(native.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('移行済みでネイティブセッションが無ければ null（authStore が signIn を呼ぶ）', async () => {
    const { deps, native, flag } = makeDeps();
    flag.isMigrated.mockResolvedValue(true);
    native.restore.mockResolvedValue(null);

    expect(await createNativeFirebaseAuthProvider(deps).init()).toBeNull();
  });
});

describe('nativeFirebaseAuthProvider.init（未移行・新規端末）', () => {
  it('JS セッションが無ければブリッジせず移行済みフラグを立てる', async () => {
    const { deps, native, jsProvider, mintCustomToken, flag } = makeDeps();
    jsProvider.init.mockResolvedValue(null);
    native.restore.mockResolvedValue(null);

    const user = await createNativeFirebaseAuthProvider(deps).init();

    expect(user).toBeNull();
    expect(mintCustomToken).not.toHaveBeenCalled();
    expect(flag.markMigrated).toHaveBeenCalledTimes(1);
  });
});

describe('nativeFirebaseAuthProvider.init（未移行・既存 JS uid → ブリッジ）', () => {
  it('JS の ID トークン→カスタムトークン→ネイティブ signInWithCustomToken で uid を引き継ぐ', async () => {
    const { deps, native, jsProvider, mintCustomToken, flag } = makeDeps();
    jsProvider.init.mockResolvedValue(jsUser({ uid: 'existing' }));
    jsProvider.getIdToken.mockResolvedValue('the-js-token');
    mintCustomToken.mockResolvedValue('the-custom-token');
    native.signInWithCustomToken.mockResolvedValue(nativeUser({ uid: 'existing', isAnonymous: true }));

    const user = await createNativeFirebaseAuthProvider(deps).init();

    expect(mintCustomToken).toHaveBeenCalledWith('the-js-token');
    expect(native.signInWithCustomToken).toHaveBeenCalledWith('the-custom-token');
    expect(user).toEqual({ uid: 'existing', provider: 'anonymous', displayName: undefined, isAnonymous: true });
    expect(flag.markMigrated).toHaveBeenCalledTimes(1);
  });

  it('ブリッジ失敗時はネイティブへ切替えず JS セッションを維持し、移行済みフラグを立てない（次回再試行）', async () => {
    const { deps, native, jsProvider, mintCustomToken, flag } = makeDeps();
    jsProvider.init.mockResolvedValue(jsUser({ uid: 'existing' }));
    mintCustomToken.mockRejectedValue(new Error('worker unreachable'));

    const provider = createNativeFirebaseAuthProvider(deps);
    const user = await provider.init();

    expect(user).toEqual(jsUser({ uid: 'existing' }));
    expect(native.signInWithCustomToken).not.toHaveBeenCalled();
    expect(flag.markMigrated).not.toHaveBeenCalled();

    // js-fallback 中は getIdToken/signOut を JS 側へ委譲する。
    await provider.getIdToken();
    expect(jsProvider.getIdToken).toHaveBeenCalled();
    expect(native.getIdToken).not.toHaveBeenCalled();
    await provider.signOut();
    expect(jsProvider.signOut).toHaveBeenCalled();
    expect(native.signOut).not.toHaveBeenCalled();
  });
});

describe('nativeFirebaseAuthProvider.signIn', () => {
  it('ネイティブ匿名サインインし移行済みフラグを立てる', async () => {
    const { deps, native, flag } = makeDeps();
    native.signInAnonymously.mockResolvedValue(nativeUser({ uid: 'fresh' }));

    const user = await createNativeFirebaseAuthProvider(deps).signIn();

    expect(user).toEqual({ uid: 'fresh', provider: 'anonymous', displayName: undefined, isAnonymous: true });
    expect(flag.markMigrated).toHaveBeenCalledTimes(1);
  });
});

describe('nativeFirebaseAuthProvider.getIdToken / signOut（native モード）', () => {
  it('getIdToken はネイティブトークンを返す', async () => {
    const { deps, native } = makeDeps();
    native.getIdToken.mockResolvedValue('tok');
    expect(await createNativeFirebaseAuthProvider(deps).getIdToken()).toBe('tok');
  });

  it('ネイティブセッションが無ければ getIdToken は throw する', async () => {
    const { deps, native } = makeDeps();
    native.getIdToken.mockResolvedValue(null);
    await expect(createNativeFirebaseAuthProvider(deps).getIdToken()).rejects.toThrow();
  });

  it('signOut はネイティブをサインアウトする', async () => {
    const { deps, native } = makeDeps();
    await createNativeFirebaseAuthProvider(deps).signOut();
    expect(native.signOut).toHaveBeenCalledTimes(1);
  });
});
