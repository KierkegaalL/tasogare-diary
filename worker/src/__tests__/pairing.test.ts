import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleCreatePairingToken, handleVerifyPairingToken } from '../pairing';
import type { Env } from '../env';

const mockCreatePairing = vi.fn();
const mockGetPairing = vi.fn();
const mockConsumePairing = vi.fn();
vi.mock('../firestore', () => ({
  createPairing: (...args: unknown[]) => mockCreatePairing(...args),
  getPairing: (...args: unknown[]) => mockGetPairing(...args),
  consumePairing: (...args: unknown[]) => mockConsumePairing(...args),
}));

const mockMintCustomToken = vi.fn();
vi.mock('../serviceAccount', () => ({
  mintCustomToken: (...args: unknown[]) => mockMintCustomToken(...args),
}));

const ENV = { FIREBASE_PROJECT_ID: 'proj' } as Env;

beforeEach(() => {
  mockCreatePairing.mockReset().mockResolvedValue(undefined);
  mockGetPairing.mockReset();
  mockConsumePairing.mockReset().mockResolvedValue(undefined);
  mockMintCustomToken.mockReset().mockResolvedValue('custom-token-xyz');
});

describe('handleCreatePairingToken', () => {
  it('トークンを発行し、pairings を作成する（ttl 60秒）', async () => {
    const before = Date.now();
    const result = await handleCreatePairingToken(ENV, 'uid-1');

    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.ttlSeconds).toBe(60);
    const exp = new Date(result.expiresAt).getTime();
    expect(exp).toBeGreaterThanOrEqual(before + 59_000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 61_000);

    expect(mockCreatePairing).toHaveBeenCalledTimes(1);
    const [env, token, fields] = mockCreatePairing.mock.calls[0] as [Env, string, Record<string, string>];
    expect(env).toBe(ENV);
    expect(token).toBe(result.token);
    expect(fields.uid).toBe('uid-1');
    expect(fields.expiresAt).toBe(result.expiresAt);
  });

  it('発行トークンは毎回異なる', async () => {
    const a = await handleCreatePairingToken(ENV, 'uid-1');
    const b = await handleCreatePairingToken(ENV, 'uid-1');
    expect(a.token).not.toBe(b.token);
  });
});

describe('handleVerifyPairingToken', () => {
  const future = () => new Date(Date.now() + 30_000).toISOString();
  const past = () => new Date(Date.now() - 1_000).toISOString();

  it('token 欠落は invalid-argument', async () => {
    await expect(handleVerifyPairingToken(ENV, {})).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockGetPairing).not.toHaveBeenCalled();
  });

  it('存在しないトークンは failed-precondition', async () => {
    mockGetPairing.mockResolvedValue(null);
    await expect(handleVerifyPairingToken(ENV, { token: 't' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(mockMintCustomToken).not.toHaveBeenCalled();
  });

  it('消費済みトークンは failed-precondition', async () => {
    mockGetPairing.mockResolvedValue({ uid: 'u', expiresAt: future(), consumed: true, updateTime: 'x' });
    await expect(handleVerifyPairingToken(ENV, { token: 't' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(mockConsumePairing).not.toHaveBeenCalled();
    expect(mockMintCustomToken).not.toHaveBeenCalled();
  });

  it('失効済みトークンは failed-precondition', async () => {
    mockGetPairing.mockResolvedValue({ uid: 'u', expiresAt: past(), consumed: false, updateTime: 'x' });
    await expect(handleVerifyPairingToken(ENV, { token: 't' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(mockConsumePairing).not.toHaveBeenCalled();
  });

  it('有効なトークンは消費し、カスタムトークンと uid を返す', async () => {
    mockGetPairing.mockResolvedValue({
      uid: 'uid-9',
      expiresAt: future(),
      consumed: false,
      updateTime: 'ut-1',
    });

    const result = await handleVerifyPairingToken(ENV, { token: 'tok' });

    expect(result).toEqual({ customToken: 'custom-token-xyz', uid: 'uid-9' });
    expect(mockConsumePairing).toHaveBeenCalledWith(ENV, 'tok', 'ut-1');
    expect(mockMintCustomToken).toHaveBeenCalledWith(ENV, 'uid-9');
  });
});
