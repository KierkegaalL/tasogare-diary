import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firestore', () => ({
  getEntry: vi.fn(),
  queryEntriesByDateRange: vi.fn(),
}));

import { handleChat } from '../index';
import { getEntry, queryEntriesByDateRange } from '../firestore';
import type { Env } from '../env';
import type { LlmProvider } from '../llm';

const ENV = {} as Env;
const mockGetEntry = getEntry as unknown as ReturnType<typeof vi.fn>;
const mockQueryEntriesByDateRange = queryEntriesByDateRange as unknown as ReturnType<typeof vi.fn>;

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
    mockQueryEntriesByDateRange.mockReset();
    mockQueryEntriesByDateRange.mockResolvedValue([]);
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

// 入力サイズの上限検証（LLMへ任意長の入力をそのまま転送しない防御）。
describe('handleChat の入力バリデーション', () => {
  beforeEach(() => {
    mockGetEntry.mockReset();
    mockQueryEntriesByDateRange.mockReset();
    mockQueryEntriesByDateRange.mockResolvedValue([]);
  });

  it('message が上限文字数を超えると invalid-argument', async () => {
    await expect(
      handleChat(ENV, llmStub(), 'u1', { message: 'x'.repeat(2001), history: [] }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('history が上限件数を超えると invalid-argument', async () => {
    const history = Array.from({ length: 51 }, () => ({ role: 'me', text: 'hi' }));
    await expect(handleChat(ENV, llmStub(), 'u1', { message: 'm', history })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('history の1件が上限文字数を超えると invalid-argument', async () => {
    const history = [{ role: 'me', text: 'x'.repeat(2001) }];
    await expect(handleChat(ENV, llmStub(), 'u1', { message: 'm', history })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});

// 関連する過去エントリの「要約」補完（api-contract.md 3.4 備考・第10章）。
// 当該エントリの日付を起点に直近14日（当日を含まない）の集計値（気分割合・頻出語）のみを
// system プロンプトへ付与する。本文は一切含めない（最小送信の原則、第8章）。
describe('handleChat の過去の傾向ノート', () => {
  beforeEach(() => {
    mockGetEntry.mockReset();
    mockQueryEntriesByDateRange.mockReset();
  });

  it('当該エントリの日付を起点に直近14日（前日まで）の範囲で過去エントリを取得する', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'calm', bodyText: '穏やかな一日', date: '2026-07-15' });
    mockQueryEntriesByDateRange.mockResolvedValue([]);
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    expect(mockQueryEntriesByDateRange).toHaveBeenCalledWith(ENV, 'u1', '2026-07-01', '2026-07-14');
  });

  it('過去エントリが3件以上あれば気分割合・頻出語を system プロンプトへ注入する', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'calm', bodyText: '穏やかな一日', date: '2026-07-15' });
    mockQueryEntriesByDateRange.mockResolvedValue([
      { date: '2026-07-01', mood: 'heavy', words: [{ text: '疲れた', category: 'mood' }] },
      { date: '2026-07-02', mood: 'heavy', words: [{ text: '疲れた', category: 'mood' }] },
      { date: '2026-07-03', mood: 'calm', words: [{ text: 'カフェ', category: 'event' }] },
    ]);
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).toContain('直近14日間（3件）の傾向');
    expect(opts.system).toContain('重い67%');
    expect(opts.system).toContain('よく出た言葉: 疲れた、カフェ');
  });

  it('過去エントリが3件未満なら傾向ノートを付与しない（データが乏しいため）', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'calm', bodyText: '穏やかな一日', date: '2026-07-15' });
    mockQueryEntriesByDateRange.mockResolvedValue([
      { date: '2026-07-01', mood: 'heavy', words: [] },
      { date: '2026-07-02', mood: 'calm', words: [] },
    ]);
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).not.toContain('直近14日間');
  });

  it('過去エントリが3件以上でも全件 mood:null なら気分割合を出さず頻出語のみ注入する', async () => {
    // 気分をスキップした日ばかりだと moodDistribution は合計0%になり得るため、
    // 「穏やか0%／ゆらぎ0%／重い0%」という不自然な数値を出さないことを確認する。
    mockGetEntry.mockResolvedValue({ mood: 'calm', bodyText: '穏やかな一日', date: '2026-07-15' });
    mockQueryEntriesByDateRange.mockResolvedValue([
      { date: '2026-07-01', mood: null, words: [{ text: 'カフェ', category: 'event' }] },
      { date: '2026-07-02', mood: null, words: [{ text: 'カフェ', category: 'event' }] },
      { date: '2026-07-03', mood: null, words: [{ text: '散歩', category: 'event' }] },
    ]);
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).toContain('直近14日間（3件）の傾向');
    expect(opts.system).not.toContain('0%');
    expect(opts.system).toContain('よく出た言葉: カフェ、散歩');
  });

  it('過去エントリに気分はあるが言葉が1件も無ければ気分割合のみ注入する', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'calm', bodyText: '穏やかな一日', date: '2026-07-15' });
    mockQueryEntriesByDateRange.mockResolvedValue([
      { date: '2026-07-01', mood: 'heavy', words: [] },
      { date: '2026-07-02', mood: 'heavy', words: [] },
      { date: '2026-07-03', mood: 'calm', words: [] },
    ]);
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).toContain('直近14日間（3件）の傾向: 穏やか33%／ゆらぎ0%／重い67%');
    // SYSTEM_CHAT のペルソナ説明文自体に「よく出た言葉」という語（コロンなし）が含まれるため、
    // 傾向ノートが実際に生成する「よく出た言葉: 」（コロン付き）で判定する。
    expect(opts.system).not.toContain('よく出た言葉: ');
  });

  it('entry.date が無ければ過去エントリ取得自体を行わない（基準日が無いため）', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'calm', bodyText: '穏やかな一日' });
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    expect(mockQueryEntriesByDateRange).not.toHaveBeenCalled();
  });

  it('entryId 未指定（entry が無い）なら過去エントリ取得も行わない', async () => {
    const llm = llmStub();

    await handleChat(ENV, llm, 'u1', { message: 'm', history: [] });

    expect(mockQueryEntriesByDateRange).not.toHaveBeenCalled();
  });

  it('queryEntriesByDateRange が例外を投げても対話を止めず、傾向ノートなしで継続する', async () => {
    mockGetEntry.mockResolvedValue({ mood: 'calm', bodyText: '穏やかな一日', date: '2026-07-15' });
    mockQueryEntriesByDateRange.mockRejectedValue(new Error('firestore down'));
    const llm = llmStub('大丈夫だよ');

    const res = await handleChat(ENV, llm, 'u1', { message: 'm', history: [], entryId: 'e1' });

    expect(res.reply).toBe('大丈夫だよ');
    const opts = (llm.callText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.system).not.toContain('直近14日間');
  });
});
