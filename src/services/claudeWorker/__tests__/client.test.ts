import { callClaudeWorker, ClaudeWorkerError } from '../client';

// claudeWorkerBaseUrl はモジュール読み込み時に環境変数から決まるため、テスト用に固定値へ差し替える。
jest.mock('../config', () => ({
  claudeWorkerBaseUrl: 'https://worker.example.com',
}));

// ID トークン取得は AuthProvider 抽象経由（getAuthProvider().getIdToken()）。プロバイダ非依存に
// なったため、firebase/app 直参照ではなく getAuthProvider をモックする
// （migration-react-native-firebase.md 第6章）。
const mockGetIdToken = jest.fn();
jest.mock('../../auth', () => ({
  getAuthProvider: () => ({ getIdToken: mockGetIdToken }),
}));

describe('callClaudeWorker', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetIdToken.mockReset().mockResolvedValue('id-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('ID トークンを Authorization ヘッダに付与して呼び出し、レスポンス JSON を返す', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'こんにちは', promptVersion: 'chat-v1' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await callClaudeWorker('/chat', { message: 'hi' });

    expect(result).toEqual({ reply: 'こんにちは', promptVersion: 'chat-v1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://worker.example.com/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
      }),
    );
  });

  it('非 OK レスポンスの error.code/message を ClaudeWorkerError にマッピングする', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'resource-exhausted', message: '混み合っています。' } }),
    }) as unknown as typeof fetch;

    await expect(callClaudeWorker('/chat', {})).rejects.toMatchObject({
      code: 'resource-exhausted',
      message: '混み合っています。',
    });
  });

  it('非 OK かつ JSON でないレスポンスはデフォルトの internal エラーにする', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    await expect(callClaudeWorker('/chat', {})).rejects.toMatchObject({ code: 'internal' });
  });

  it('fetch 自体が失敗した場合は unavailable にマッピングする', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('network down')) as unknown as typeof fetch;

    await expect(callClaudeWorker('/chat', {})).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('ID トークン取得が失敗（未サインイン等）した場合は unauthenticated にする', async () => {
    mockGetIdToken.mockRejectedValue(new Error('no session'));

    await expect(callClaudeWorker('/chat', {})).rejects.toBeInstanceOf(ClaudeWorkerError);
    await expect(callClaudeWorker('/chat', {})).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
