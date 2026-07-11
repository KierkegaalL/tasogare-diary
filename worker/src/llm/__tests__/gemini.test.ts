import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGeminiProvider } from '../gemini';
import type { GeminiEnv } from '../gemini';
import { ApiError } from '../types';

// Gemini 応答（成功）のモックを組み立てる。
function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

// Gemini エラー応答（非 OK）のモック。
function errResponse(status: number, body: unknown = {}): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as unknown as Response;
}

function textPayload(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

const ENV: GeminiEnv = { GEMINI_API_KEY: 'test-key' };

describe('createGeminiProvider', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('callText: テキストを返し、リクエストにモデル・ヘッダ・systemInstruction を含める', async () => {
    fetchMock.mockResolvedValue(okResponse(textPayload('こんにちは')));
    const provider = createGeminiProvider(ENV);

    const result = await provider.callText({
      purpose: 'interactive',
      system: 'あなたは伴走者です',
      userText: 'やあ',
    });

    expect(result).toBe('こんにちは');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/gemini-3.1-flash-lite:generateContent'); // interactive 既定
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('あなたは伴走者です');
    expect(body.contents.at(-1)).toEqual({ role: 'user', parts: [{ text: 'やあ' }] });
  });

  it('purpose=generate は generate モデルを使い、env で上書きできる', async () => {
    fetchMock.mockResolvedValue(okResponse(textPayload('ok')));

    await createGeminiProvider(ENV).callText({ purpose: 'generate', system: 's', userText: 'u' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/gemini-3.5-flash:generateContent');

    fetchMock.mockClear();
    const overridden: GeminiEnv = {
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL_INTERACTIVE: 'model-i',
      GEMINI_MODEL_GENERATE: 'model-g',
    };
    await createGeminiProvider(overridden).callText({ purpose: 'generate', system: 's', userText: 'u' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/model-g:generateContent');
  });

  it('history の assistant/user を Gemini の model/user に写像する', async () => {
    fetchMock.mockResolvedValue(okResponse(textPayload('ok')));

    await createGeminiProvider(ENV).callText({
      purpose: 'interactive',
      system: 's',
      userText: '最新の発言',
      history: [
        { role: 'assistant', text: 'AIの発言' },
        { role: 'user', text: 'ユーザーの発言' },
      ],
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.contents).toEqual([
      { role: 'model', parts: [{ text: 'AIの発言' }] },
      { role: 'user', parts: [{ text: 'ユーザーの発言' }] },
      { role: 'user', parts: [{ text: '最新の発言' }] },
    ]);
  });

  it('callJson: JSON をパースして返し、jsonSchema を responseSchema に設定する', async () => {
    fetchMock.mockResolvedValue(okResponse(textPayload('{"bodyText":"本文","mood":"tender"}')));
    const schema = { type: 'object', properties: { bodyText: { type: 'string' } } };

    const result = await createGeminiProvider(ENV).callJson<{ bodyText: string; mood: string }>({
      purpose: 'generate',
      system: 's',
      userText: 'u',
      jsonSchema: schema,
    });

    expect(result).toEqual({ bodyText: '本文', mood: 'tender' });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toEqual(schema);
  });

  it('callJson: 不正な JSON は unavailable にする', async () => {
    fetchMock.mockResolvedValue(okResponse(textPayload('これはJSONではない')));

    await expect(
      createGeminiProvider(ENV).callJson({ purpose: 'generate', system: 's', userText: 'u' }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('callText: 空応答は unavailable にする', async () => {
    fetchMock.mockResolvedValue(okResponse({ candidates: [{ content: { parts: [] } }] }));

    await expect(
      createGeminiProvider(ENV).callText({ purpose: 'interactive', system: 's', userText: 'u' }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('GEMINI_API_KEY 未設定は internal(500) にする（callText）', async () => {
    await expect(
      createGeminiProvider({}).callText({ purpose: 'interactive', system: 's', userText: 'u' }),
    ).rejects.toMatchObject({ code: 'internal', status: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GEMINI_API_KEY 未設定は internal(500) にする（callJson）', async () => {
    await expect(
      createGeminiProvider({}).callJson({ purpose: 'generate', system: 's', userText: 'u' }),
    ).rejects.toMatchObject({ code: 'internal', status: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'resource-exhausted', 429],
    [400, 'invalid-argument', 400],
    [401, 'internal', 500],
    [403, 'internal', 500],
    [500, 'unavailable', 503],
    [503, 'unavailable', 503],
  ])('HTTP %i を %s へ写像する', async (httpStatus, code, mappedStatus) => {
    fetchMock.mockResolvedValue(errResponse(httpStatus, { error: { status: 'X' } }));

    await expect(
      createGeminiProvider(ENV).callText({ purpose: 'interactive', system: 's', userText: 'u' }),
    ).rejects.toMatchObject({ code, status: mappedStatus });
  });

  it('AbortError（タイムアウト）は deadline-exceeded にする', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(
      createGeminiProvider(ENV).callText({ purpose: 'interactive', system: 's', userText: 'u' }),
    ).rejects.toMatchObject({ code: 'deadline-exceeded', status: 504 });
  });

  it('タイムアウトは purpose ごとに異なる（interactive=15秒・generate=20秒。2026-07-11再検討）', async () => {
    // fetch を解決させず、setTimeout に渡された遅延だけを確認する。
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    // fetch が永久に解決しないため呼び出しも永久に保留になる。宙に浮いた拒否/タイマーを
    // 残さないよう例外は握りつぶす（reviewer指摘）。
    void createGeminiProvider(ENV)
      .callText({ purpose: 'interactive', system: 's', userText: 'u' })
      .catch(() => {});
    await Promise.resolve();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 15_000);

    setTimeoutSpy.mockClear();
    void createGeminiProvider(ENV)
      .callText({ purpose: 'generate', system: 's', userText: 'u' })
      .catch(() => {});
    await Promise.resolve();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 20_000);

    setTimeoutSpy.mockRestore();
  });

  it('その他の fetch 例外は unavailable にする', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await expect(
      createGeminiProvider(ENV).callText({ purpose: 'interactive', system: 's', userText: 'u' }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('マッピング結果は ApiError インスタンスである', async () => {
    fetchMock.mockResolvedValue(errResponse(429));
    await expect(
      createGeminiProvider(ENV).callText({ purpose: 'interactive', system: 's', userText: 'u' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  describe('Gemini 5xx（過負荷）の再試行', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('503 の後に成功すれば、1回だけ再試行して結果を返す', async () => {
      fetchMock
        .mockResolvedValueOnce(errResponse(503, { error: { status: 'UNAVAILABLE' } }))
        .mockResolvedValueOnce(okResponse(textPayload('復帰した')));

      const promise = createGeminiProvider(ENV).callText({
        purpose: 'interactive',
        system: 's',
        userText: 'u',
      });
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('復帰した');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('503 が続く場合は再試行1回で打ち切り、unavailable を返す', async () => {
      fetchMock.mockResolvedValue(errResponse(503, { error: { status: 'UNAVAILABLE' } }));

      const promise = createGeminiProvider(ENV).callText({
        purpose: 'interactive',
        system: 's',
        userText: 'u',
      });
      // rejects の待ち受けはタイマー進行前に張る（unhandled rejection を防ぐ）。
      const assertion = expect(promise).rejects.toMatchObject({ code: 'unavailable', status: 503 });
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('429（レート制限）は再試行しない', async () => {
      fetchMock.mockResolvedValue(errResponse(429));

      const promise = createGeminiProvider(ENV).callText({
        purpose: 'interactive',
        system: 's',
        userText: 'u',
      });
      const assertion = expect(promise).rejects.toMatchObject({ code: 'resource-exhausted', status: 429 });
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
