import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firestore', () => ({
  getEntry: vi.fn(),
}));

import { handleChat } from '../index';
import { getEntry } from '../firestore';
import type { Env } from '../env';
import type { LlmProvider } from '../llm';

const ENV = {} as Env;
const mockGetEntry = getEntry as unknown as ReturnType<typeof vi.fn>;

function llmStub(reply = '相づち'): LlmProvider {
  return {
    name: 'stub',
    modelFor: () => 'stub-model',
    callText: vi.fn().mockResolvedValue(reply),
    callJson: vi.fn(),
  };
}

// chat のサーバ側文脈補完（api-contract.md 3.4 備考）。entryId から当該日の感情・本文を
// 都度サーバ側で補い、対話が長くなり client history が切り詰められても文脈が失われないことを確認する。
describe('handleChat の文脈補完', () => {
  beforeEach(() => {
    mockGetEntry.mockReset();
  });

  it('entryId が有効なら getEntry の結果を system プロンプトへ注入する', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'tender', bodyText: 'カフェで過ごした' });
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'そうなんだ', history: [], entryId: 'e1' });

    expect(mockGetEntry).toHaveBeenCalledWith(ENV, 'u1', 'e1');
    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).toContain('感情=tender');
    expect(opts.system).toContain('カフェで過ごした');
  });

  it('mood が null（スキップされた日）でも本文だけで補完する', async () => {
    mockGetEntry.mockResolvedValue({ mood: null, bodyText: '静かな一日だった' });
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).toContain('感情=不明');
    expect(opts.system).toContain('静かな一日だった');
  });

  it('entryId 未指定なら getEntry を呼ばず、素の system プロンプトのまま送る', async () => {
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [] });

    expect(mockGetEntry).not.toHaveBeenCalled();
    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).not.toContain('この日の記録');
  });

  it('entryId が空文字列なら getEntry を呼ばず、素の system プロンプトのまま送る', async () => {
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: '' });

    expect(mockGetEntry).not.toHaveBeenCalled();
    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).not.toContain('この日の記録');
  });

  it('getEntry が null（entryId不正・削除済み）でも対話自体は継続する（フォールバック）', async () => {
    mockGetEntry.mockResolvedValue(null);
    const llm = llmStub('大丈夫だよ');

    const res = await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'gone' });

    expect(res.reply).toBe('大丈夫だよ');
    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).not.toContain('この日の記録');
  });

  it('getEntry が例外を投げても対話を止めない（必須情報ではないため）', async () => {
    mockGetEntry.mockRejectedValue(new Error('firestore down'));
    const llm = llmStub('大丈夫だよ');

    const res = await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    expect(res.reply).toBe('大丈夫だよ');
  });
});
