import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDeleteAccount } from '../account';
import type { Env } from '../env';

vi.mock('../firestore', () => ({
  deleteUserData: vi.fn(),
  deletePairingsForUid: vi.fn(),
}));

vi.mock('../serviceAccount', () => ({
  getIdentityToolkitAccessToken: async () => 'it-token',
  serviceAccountProjectId: () => 'proj-1',
}));

import { deletePairingsForUid, deleteUserData } from '../firestore';

const ENV = {} as Env;
const ACCOUNTS_DELETE_URL = 'https://identitytoolkit.googleapis.com/v1/projects/proj-1/accounts:delete';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(deleteUserData).mockReset().mockResolvedValue(3);
  vi.mocked(deletePairingsForUid).mockReset().mockResolvedValue(1);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleDeleteAccount', () => {
  it('Firestore サブツリー → pairings → Auth の順に削除し { deleted: true } を返す', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const order: string[] = [];
    vi.mocked(deleteUserData).mockImplementation(async () => {
      order.push('tree');
      return 3;
    });
    vi.mocked(deletePairingsForUid).mockImplementation(async () => {
      order.push('pairings');
      return 1;
    });
    fetchMock.mockImplementation(async () => {
      order.push('auth');
      return { ok: true, status: 200, json: async () => ({}) };
    });

    expect(await handleDeleteAccount(ENV, 'u1')).toEqual({ deleted: true });

    // Auth を最後にするのは、途中失敗時に同じ ID トークンで再実行できるようにするため。
    expect(order).toEqual(['tree', 'pairings', 'auth']);
    expect(deleteUserData).toHaveBeenCalledWith(ENV, 'u1');
    expect(deletePairingsForUid).toHaveBeenCalledWith(ENV, 'u1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ACCOUNTS_DELETE_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer it-token');
    expect(JSON.parse(init.body as string)).toEqual({ localId: 'u1' });
  });

  it('Auth ユーザーが既に無ければ（USER_NOT_FOUND）成功扱い＝冪等', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'USER_NOT_FOUND' } }),
    });
    expect(await handleDeleteAccount(ENV, 'u1')).toEqual({ deleted: true });
  });

  it('Firestore の削除に失敗したら Auth ユーザーは消さない', async () => {
    vi.mocked(deleteUserData).mockRejectedValue(
      Object.assign(new Error('x'), { status: 503, code: 'unavailable' }),
    );
    await expect(handleDeleteAccount(ENV, 'u1')).rejects.toMatchObject({ code: 'unavailable' });
    expect(deletePairingsForUid).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Auth の 429 は resource-exhausted、5xx は unavailable に写像する', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(handleDeleteAccount(ENV, 'u1')).rejects.toMatchObject({ code: 'resource-exhausted' });

    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(handleDeleteAccount(ENV, 'u1')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('Auth のその他エラーは internal。エラー詳細は応答にもログにも出さない', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'PERMISSION_DENIED: uid=u1 secret detail' } }),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handleDeleteAccount(ENV, 'u1')).rejects.toMatchObject({
      code: 'internal',
      message: '想定外のエラーが発生しました。',
    });

    // ログに残すのはエラー種別まで（uid や詳細は残さない。api-contract.md 第8章）。
    expect(errorSpy).toHaveBeenCalledWith('Failed to delete auth user', 403, 'PERMISSION_DENIED');
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('u1');
    errorSpy.mockRestore();
  });

  it('ネットワーク断は unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    await expect(handleDeleteAccount(ENV, 'u1')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
