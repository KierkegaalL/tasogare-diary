import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleMigrateToNativeAuth } from '../migration';
import type { Env } from '../env';

const mockMintCustomToken = vi.fn();
vi.mock('../serviceAccount', () => ({
  mintCustomToken: (...args: unknown[]) => mockMintCustomToken(...args),
}));

const ENV = { FIREBASE_PROJECT_ID: 'proj' } as Env;

beforeEach(() => {
  mockMintCustomToken.mockReset().mockResolvedValue('custom-token-abc');
});

describe('handleMigrateToNativeAuth', () => {
  it('確立済み uid に対し同一 uid のカスタムトークンを発行して返す', async () => {
    const result = await handleMigrateToNativeAuth(ENV, 'uid-1');

    expect(result).toEqual({ customToken: 'custom-token-abc' });
    expect(mockMintCustomToken).toHaveBeenCalledTimes(1);
    expect(mockMintCustomToken).toHaveBeenCalledWith(ENV, 'uid-1');
  });

  it('mintCustomToken の失敗はそのまま伝播する（呼び出し元でエラー応答に写像する）', async () => {
    mockMintCustomToken.mockRejectedValue(new Error('sa error'));
    await expect(handleMigrateToNativeAuth(ENV, 'uid-1')).rejects.toThrow('sa error');
  });
});
