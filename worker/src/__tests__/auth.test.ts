import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jwtVerify } from 'jose';

import { verifyFirebaseIdToken, AuthError } from '../auth';

// jose はネットワーク（JWKS 取得）を伴うためモックする。createRemoteJWKSet はモジュール読み込み時に
// 呼ばれるため、ダミーを返しておく。jwtVerify は各テストで戻り値/例外を差し替える。
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
}));

const mockedJwtVerify = vi.mocked(jwtVerify);

// jwtVerify の戻り値（payload のみ関心があるので他フィールドはキャストで省略）。
function resolvePayload(payload: Record<string, unknown>): void {
  mockedJwtVerify.mockResolvedValue({ payload } as unknown as Awaited<ReturnType<typeof jwtVerify>>);
}

const PROJECT_ID = 'tasogare-diary-project';

describe('verifyFirebaseIdToken', () => {
  beforeEach(() => {
    mockedJwtVerify.mockReset();
  });

  it('Authorization ヘッダが無ければ AuthError', async () => {
    await expect(verifyFirebaseIdToken(null, PROJECT_ID)).rejects.toBeInstanceOf(AuthError);
  });

  it('Bearer 形式でなければ AuthError', async () => {
    await expect(verifyFirebaseIdToken('Token abc', PROJECT_ID)).rejects.toBeInstanceOf(AuthError);
  });

  it('トークンが空なら AuthError', async () => {
    await expect(verifyFirebaseIdToken('Bearer ', PROJECT_ID)).rejects.toBeInstanceOf(AuthError);
    expect(mockedJwtVerify).not.toHaveBeenCalled();
  });

  it('検証成功時は sub(uid) を返し、issuer/audience を渡す', async () => {
    resolvePayload({ sub: 'uid-123', auth_time: Math.floor(Date.now() / 1000) - 60 });

    const uid = await verifyFirebaseIdToken('Bearer valid.token', PROJECT_ID);

    expect(uid).toBe('uid-123');
    const opts = mockedJwtVerify.mock.calls[0][2] as { issuer: string; audience: string };
    expect(opts.issuer).toBe(`https://securetoken.google.com/${PROJECT_ID}`);
    expect(opts.audience).toBe(PROJECT_ID);
  });

  it('jwtVerify が例外を投げたら AuthError', async () => {
    mockedJwtVerify.mockRejectedValue(new Error('invalid signature'));

    await expect(verifyFirebaseIdToken('Bearer bad.token', PROJECT_ID)).rejects.toBeInstanceOf(AuthError);
  });

  it('sub が空文字なら AuthError', async () => {
    resolvePayload({ sub: '' });
    await expect(verifyFirebaseIdToken('Bearer t', PROJECT_ID)).rejects.toBeInstanceOf(AuthError);
  });

  it('sub が 128 文字超なら AuthError', async () => {
    resolvePayload({ sub: 'a'.repeat(129) });
    await expect(verifyFirebaseIdToken('Bearer t', PROJECT_ID)).rejects.toBeInstanceOf(AuthError);
  });

  it('auth_time が未来なら AuthError', async () => {
    resolvePayload({ sub: 'uid', auth_time: Math.floor(Date.now() / 1000) + 3600 });
    await expect(verifyFirebaseIdToken('Bearer t', PROJECT_ID)).rejects.toBeInstanceOf(AuthError);
  });

  it('auth_time が無くても sub があれば成功する', async () => {
    resolvePayload({ sub: 'uid-xyz' });
    await expect(verifyFirebaseIdToken('Bearer t', PROJECT_ID)).resolves.toBe('uid-xyz');
  });
});
