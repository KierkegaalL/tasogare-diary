import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firestore', () => ({
  getEntry: vi.fn(),
}));

import { handleChatOpening } from '../index';
import { getEntry } from '../firestore';
import type { Env } from '../env';
import type { LlmProvider } from '../llm';

const ENV = {} as Env;
const mockGetEntry = getEntry as unknown as ReturnType<typeof vi.fn>;

function llmStub(reply = '今日はどんな一日でしたか？'): LlmProvider {
  return {
    name: 'stub',
    modelFor: () => 'stub-model',
    callText: vi.fn().mockResolvedValue(reply),
    callJson: vi.fn(),
  };
}

// chatOpening のサーバ側文脈補完（handleChat と経路を統一。reviewer所見）。
// クライアント送信の mood/bodyText はフォールバックに留め、entryId から都度サーバ側で
// 取得した値を正として使う。
describe('handleChatOpening の文脈補完', () => {
  beforeEach(() => {
    mockGetEntry.mockReset();
  });

  it('entryId が有効なら getEntry の結果を使い、クライアント送信の mood/bodyText は無視する', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'tender', bodyText: 'カフェで過ごした' });
    const llm = llmStub();

    await handleChatOpening(ENV, llm, 'u1', {
      entryId: 'e1',
      mood: 'heavy', // クライアント側の値（信用しない）
      bodyText: '偽の本文',
    });

    expect(mockGetEntry).toHaveBeenCalledWith(ENV, 'u1', 'e1');
    const userText = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0].userText as string;
    expect(userText).toContain('カフェで過ごした');
    expect(userText).toContain('tender');
    expect(userText).not.toContain('偽の本文');
  });

  it('getEntry が null（entryId不正・削除済み）ならクライアント送信の mood/bodyText にフォールバックする', async () => {
    mockGetEntry.mockResolvedValue(null);
    const llm = llmStub();

    await handleChatOpening(ENV, llm, 'u1', { entryId: 'gone', mood: 'calm', bodyText: '静かな一日' });

    const userText = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0].userText as string;
    expect(userText).toContain('静かな一日');
    expect(userText).toContain('calm');
  });

  it('getEntry が例外を投げても対話自体は継続する（フォールバック）', async () => {
    mockGetEntry.mockRejectedValue(new Error('firestore down'));
    const llm = llmStub('よかったら聞かせてください');

    const res = await handleChatOpening(ENV, llm, 'u1', { entryId: 'e1', mood: null, bodyText: 'b' });

    expect(res.reply).toBe('よかったら聞かせてください');
  });

  it('entryId 未指定なら getEntry を呼ばず、クライアント送信の mood/bodyText を使う', async () => {
    const llm = llmStub();

    await handleChatOpening(ENV, llm, 'u1', { mood: 'calm', bodyText: '直接送信された本文' });

    expect(mockGetEntry).not.toHaveBeenCalled();
    const userText = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0].userText as string;
    expect(userText).toContain('直接送信された本文');
  });
});
