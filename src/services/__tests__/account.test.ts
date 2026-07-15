import { deleteAccount } from '../account';

// account.ts は claudeWorker/client 経由で firebase を読み込むため、client をモックして実 import を回避する。
const mockCallClaudeWorker = jest.fn();
jest.mock('../claudeWorker/client', () => ({
  callClaudeWorker: (...args: unknown[]) => mockCallClaudeWorker(...args),
}));

describe('deleteAccount', () => {
  beforeEach(() => {
    mockCallClaudeWorker.mockReset().mockResolvedValue({ deleted: true });
  });

  it('/deleteAccount を空ボディで呼ぶ（uid は ID トークンからサーバが決める）', async () => {
    expect(await deleteAccount()).toEqual({ deleted: true });
    expect(mockCallClaudeWorker).toHaveBeenCalledWith('/deleteAccount', {});
  });

  it('サーバのエラーはそのまま伝播する（握りつぶさない）', async () => {
    const err = Object.assign(new Error('unavailable'), { code: 'unavailable' });
    mockCallClaudeWorker.mockRejectedValue(err);
    await expect(deleteAccount()).rejects.toBe(err);
  });
});
