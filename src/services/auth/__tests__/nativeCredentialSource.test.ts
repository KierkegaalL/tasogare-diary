import { AuthLinkError } from '../types';
import { createNativeCredentialSource, type NativeSignInDeps } from '../nativeCredentialSource';

// 実ネイティブモジュールに依存せず、注入した NativeSignInDeps だけで中核ロジックを検証する。
function makeDeps(overrides: Partial<NativeSignInDeps> = {}): NativeSignInDeps {
  return {
    apple: {
      isAvailable: () => true,
      signIn: jest.fn(async () => ({ identityToken: 'apple-id-token' })),
    },
    google: {
      isAvailable: () => true,
      signIn: jest.fn(async () => ({ idToken: 'google-id-token', accessToken: 'google-access' })),
    },
    generateRawNonce: jest.fn(() => 'raw-nonce'),
    sha256Hex: jest.fn(async (input: string) => `sha256(${input})`),
    isCancellation: () => false,
    ...overrides,
  };
}

describe('createNativeCredentialSource', () => {
  describe('isAvailable', () => {
    it('apple/google の手段が存在し isAvailable=true なら true', () => {
      const src = createNativeCredentialSource(makeDeps());
      expect(src.isAvailable('apple')).toBe(true);
      expect(src.isAvailable('google')).toBe(true);
    });

    it('手段が null／isAvailable=false なら false', () => {
      const src = createNativeCredentialSource(
        makeDeps({ apple: null, google: { isAvailable: () => false, signIn: jest.fn() } }),
      );
      expect(src.isAvailable('apple')).toBe(false);
      expect(src.isAvailable('google')).toBe(false);
    });
  });

  describe('getCredential（Apple）', () => {
    it('生 nonce→SHA256→signIn(hashed) の順で、rawNonce 付き資格情報を返す', async () => {
      const deps = makeDeps();
      const src = createNativeCredentialSource(deps);
      const cred = await src.getCredential('apple');

      expect(cred).toEqual({ kind: 'apple', idToken: 'apple-id-token', rawNonce: 'raw-nonce' });
      expect(deps.sha256Hex).toHaveBeenCalledWith('raw-nonce');
      // ネイティブUIへ渡すのは生値ではなく SHA256 済み nonce。
      expect(deps.apple!.signIn).toHaveBeenCalledWith('sha256(raw-nonce)');
    });

    it('identityToken が無ければ AuthLinkError("unknown")', async () => {
      const deps = makeDeps({ apple: { isAvailable: () => true, signIn: jest.fn(async () => ({ identityToken: null })) } });
      const src = createNativeCredentialSource(deps);
      await expect(src.getCredential('apple')).rejects.toMatchObject({ name: 'AuthLinkError', code: 'unknown' });
    });

    it('手段が無ければ AuthLinkError("unavailable")', async () => {
      const src = createNativeCredentialSource(makeDeps({ apple: null }));
      await expect(src.getCredential('apple')).rejects.toMatchObject({ code: 'unavailable' });
    });
  });

  describe('getCredential（Google）', () => {
    it('idToken・accessToken 付き資格情報を返す', async () => {
      const src = createNativeCredentialSource(makeDeps());
      await expect(src.getCredential('google')).resolves.toEqual({
        kind: 'google',
        idToken: 'google-id-token',
        accessToken: 'google-access',
      });
    });

    it('accessToken は任意（null なら undefined になる）', async () => {
      const deps = makeDeps({
        google: { isAvailable: () => true, signIn: jest.fn(async () => ({ idToken: 'g', accessToken: null })) },
      });
      const cred = await createNativeCredentialSource(deps).getCredential('google');
      expect(cred).toEqual({ kind: 'google', idToken: 'g', accessToken: undefined });
    });

    it('idToken が無ければ AuthLinkError("unknown")', async () => {
      const deps = makeDeps({ google: { isAvailable: () => true, signIn: jest.fn(async () => ({ idToken: null })) } });
      await expect(createNativeCredentialSource(deps).getCredential('google')).rejects.toMatchObject({ code: 'unknown' });
    });
  });

  describe('エラー写像', () => {
    it('キャンセル（isCancellation=true）は AuthLinkError("cancelled")', async () => {
      const deps = makeDeps({
        isCancellation: () => true,
        apple: {
          isAvailable: () => true,
          signIn: jest.fn(async () => {
            throw new Error('canceled');
          }),
        },
      });
      await expect(createNativeCredentialSource(deps).getCredential('apple')).rejects.toMatchObject({
        code: 'cancelled',
      });
    });

    it('その他の失敗は AuthLinkError("unknown")', async () => {
      const deps = makeDeps({
        google: {
          isAvailable: () => true,
          signIn: jest.fn(async () => {
            throw new Error('boom');
          }),
        },
      });
      await expect(createNativeCredentialSource(deps).getCredential('google')).rejects.toMatchObject({ code: 'unknown' });
    });

    it('既に AuthLinkError の場合はそのまま素通しする（二重写像しない）', async () => {
      const original = new AuthLinkError('email-already-in-use', 'x');
      const deps = makeDeps({
        // isCancellation が true でも、AuthLinkError は先に素通しされ cancelled に化けない。
        isCancellation: () => true,
        apple: {
          isAvailable: () => true,
          signIn: jest.fn(async () => {
            throw original;
          }),
        },
      });
      await expect(createNativeCredentialSource(deps).getCredential('apple')).rejects.toBe(original);
    });
  });

  it('機微情報（idToken/rawNonce/accessToken）をログ出力しない', async () => {
    const spies = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    const src = createNativeCredentialSource(makeDeps());
    await src.getCredential('apple');
    await src.getCredential('google');
    for (const s of spies) {
      expect(s).not.toHaveBeenCalled();
      s.mockRestore();
    }
  });
});
