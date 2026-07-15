import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aggregate, aggregateWeekly, handleGenerateInsight, isCacheFresh, periodRange } from '../insight';
import type { EntrySummary, InsightDoc } from '../firestore';
import type { Env } from '../env';
import type { LlmProvider } from '../llm';

vi.mock('../firestore', () => ({
  getInsight: vi.fn(),
  queryEntriesByDateRange: vi.fn(),
  saveInsight: vi.fn(),
}));

import { getInsight, queryEntriesByDateRange, saveInsight } from '../firestore';

const ENV = {} as Env;

function llmStub(narrative = 'まとめ文'): LlmProvider {
  return {
    name: 'stub',
    modelFor: () => 'stub-generate-model',
    callText: vi.fn().mockResolvedValue(narrative),
    callJson: vi.fn(),
  };
}

function entry(date: string, mood: string | null, words: string[]): EntrySummary {
  return { date, mood, words: words.map((text) => ({ text, category: null })) };
}

describe('periodRange', () => {
  it('monthly は月初〜月末を返す（うるう年の2月を含む）', () => {
    expect(periodRange('monthly', '2026-07')).toEqual({ rangeStart: '2026-07-01', rangeEnd: '2026-07-31' });
    expect(periodRange('monthly', '2026-02')).toEqual({ rangeStart: '2026-02-01', rangeEnd: '2026-02-28' });
    expect(periodRange('monthly', '2024-02')).toEqual({ rangeStart: '2024-02-01', rangeEnd: '2024-02-29' });
  });

  it('weekly は ISO週の月曜〜日曜を返す', () => {
    // 2026-W01 は木曜が 2026-01-01 のため 2025-12-29(月) 始まり。
    expect(periodRange('weekly', '2026-W01')).toEqual({ rangeStart: '2025-12-29', rangeEnd: '2026-01-04' });
    expect(periodRange('weekly', '2026-W27')).toEqual({ rangeStart: '2026-06-29', rangeEnd: '2026-07-05' });
  });

  it('第53週は、その年に存在するときだけ受け付ける', () => {
    // 2025 年は52週まで（1/1が水曜・非うるう年）→ W53 は存在しない。
    expect(() => periodRange('weekly', '2025-W53')).toThrowError(/存在しません/);
    // 2026 年は1/1が木曜なので53週ある。年をまたいで 2027-01-03 まで。
    expect(periodRange('weekly', '2026-W53')).toEqual({ rangeStart: '2026-12-28', rangeEnd: '2027-01-03' });
  });

  it('quarterly は末尾月を含む直近3ヶ月（末尾月＋前2ヶ月）を返す', () => {
    expect(periodRange('quarterly', '2026-07')).toEqual({ rangeStart: '2026-05-01', rangeEnd: '2026-07-31' });
    // 年跨ぎ：2026-02 → 2025-12〜2026-02。
    expect(periodRange('quarterly', '2026-02')).toEqual({ rangeStart: '2025-12-01', rangeEnd: '2026-02-28' });
    expect(periodRange('quarterly', '2026-01')).toEqual({ rangeStart: '2025-11-01', rangeEnd: '2026-01-31' });
    // 末尾月がうるう年2月でも末日を正しく取る。
    expect(periodRange('quarterly', '2024-02')).toEqual({ rangeStart: '2023-12-01', rangeEnd: '2024-02-29' });
  });

  it('形式・範囲が不正な periodKey は invalid-argument', () => {
    expect(() => periodRange('monthly', '2026-13')).toThrowError(/YYYY-MM/);
    expect(() => periodRange('monthly', '2026-7')).toThrowError(/YYYY-MM/);
    expect(() => periodRange('quarterly', '2026-13')).toThrowError(/YYYY-MM/);
    expect(() => periodRange('quarterly', '2026-7')).toThrowError(/YYYY-MM/);
    expect(() => periodRange('weekly', '2026-27')).toThrowError(/YYYY-Www/);
    expect(() => periodRange('weekly', '2026-W00')).toThrowError(/週番号/);
  });
});

describe('aggregate', () => {
  it('mood を百分率にし、合計が必ず 100 になる', () => {
    const entries = [
      entry('2026-07-01', 'calm', []),
      entry('2026-07-02', 'tender', []),
      entry('2026-07-03', 'heavy', []),
    ];
    const { moodDistribution } = aggregate(entries);
    // 33.33...% ずつ → 最大剰余法で合計 100。
    expect(moodDistribution.calm + moodDistribution.tender + moodDistribution.heavy).toBe(100);
    expect(moodDistribution).toEqual({ calm: 34, tender: 33, heavy: 33 });
  });

  it('mood が null のエントリは母数から除外する', () => {
    const entries = [entry('2026-07-01', 'calm', []), entry('2026-07-02', null, [])];
    expect(aggregate(entries).moodDistribution).toEqual({ calm: 100, tender: 0, heavy: 0 });
  });

  it('mood が1件も無い場合はすべて 0（100 を配らない）', () => {
    expect(aggregate([entry('2026-07-01', null, [])]).moodDistribution).toEqual({ calm: 0, tender: 0, heavy: 0 });
  });

  it('topWords は件数降順・同数は語の昇順', () => {
    const entries = [
      entry('2026-07-01', 'calm', ['疲れた', 'カフェ']),
      entry('2026-07-02', 'calm', ['疲れた', 'あめ']),
      entry('2026-07-03', 'calm', ['疲れた']),
    ];
    const { topWords } = aggregate(entries);
    expect(topWords[0]).toEqual({ word: '疲れた', count: 3 });
    // カフェ と あめ は同数1 → localeCompare 昇順で安定させる。
    expect(topWords.slice(1).map((w) => w.count)).toEqual([1, 1]);
    expect(topWords.slice(1).map((w) => w.word)).toEqual([...topWords.slice(1).map((w) => w.word)].sort((a, b) => a.localeCompare(b)));
  });

  it('同一エントリ内の重複語は1回として数える', () => {
    const entries = [entry('2026-07-01', 'calm', ['雨', '雨', '雨'])];
    expect(aggregate(entries).topWords).toEqual([{ word: '雨', count: 1 }]);
  });

  it('topWords は最大10件', () => {
    const words = Array.from({ length: 15 }, (_, i) => `w${i}`);
    expect(aggregate([entry('2026-07-01', 'calm', words)]).topWords).toHaveLength(10);
  });
});

describe('aggregateWeekly', () => {
  it('週（月曜始まり）ごとに百分率を集計する', () => {
    // 2026-05-01(金)は週2026-04-27(月)〜05-03(日)、2026-05-04(月)からは次の週。
    const entries = [
      entry('2026-05-01', 'calm', []),
      entry('2026-05-04', 'tender', []),
      entry('2026-05-08', 'heavy', []),
    ];
    const weeks = aggregateWeekly(entries, '2026-04-27', '2026-05-10');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-04-27', '2026-05-04']);
    expect(weeks[0].distribution).toEqual({ calm: 100, tender: 0, heavy: 0 });
    expect(weeks[1].distribution).toEqual({ calm: 0, tender: 50, heavy: 50 });
  });

  it('エントリが無い週も0件の週として範囲に含める（推移の空白を表す）', () => {
    const weeks = aggregateWeekly([entry('2026-05-01', 'calm', [])], '2026-04-27', '2026-05-17');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-04-27', '2026-05-04', '2026-05-11']);
    expect(weeks[1].distribution).toEqual({ calm: 0, tender: 0, heavy: 0 });
    expect(weeks[2].distribution).toEqual({ calm: 0, tender: 0, heavy: 0 });
  });

  it('mood が null のエントリは母数から除外する（aggregate と同じ扱い）', () => {
    const weeks = aggregateWeekly([entry('2026-05-01', null, [])], '2026-04-27', '2026-05-03');
    expect(weeks).toEqual([{ weekStart: '2026-04-27', distribution: { calm: 0, tender: 0, heavy: 0 } }]);
  });

  it('年をまたぐ範囲でも週を正しく列挙する', () => {
    // 2025-12-29(月)・2026-01-05(月)はいずれも月曜＝別の週として2週分列挙される。
    const weeks = aggregateWeekly([], '2025-12-29', '2026-01-05');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2025-12-29', '2026-01-05']);
  });
});

describe('isCacheFresh', () => {
  const cached = (generatedAt: string) => ({ generatedAt }) as InsightDoc;
  const now = Date.parse('2026-07-10T00:00:00.000Z');

  it('期間が終了していれば古くても有効（内容は変わらない）', () => {
    expect(isCacheFresh(cached('2026-07-01T00:00:00.000Z'), '2026-07-05', now)).toBe(true);
  });

  it('進行中の期間は TTL(1時間) 内なら有効', () => {
    expect(isCacheFresh(cached('2026-07-09T23:30:00.000Z'), '2026-07-31', now)).toBe(true);
  });

  it('進行中の期間で TTL を超えたら無効', () => {
    expect(isCacheFresh(cached('2026-07-09T22:00:00.000Z'), '2026-07-31', now)).toBe(false);
  });

  it('rangeEnd が今日と同じ日はまだ進行中として扱う', () => {
    expect(isCacheFresh(cached('2026-07-01T00:00:00.000Z'), '2026-07-10', now)).toBe(false);
  });

  // 端末ローカル日付が UTC より遅れる TZ（負オフセット）を考慮し、確定判定は丸1日遅らせる。
  it('rangeEnd が昨日（UTC）でも、まだ確定扱いにしない（負オフセット TZ の取りこぼし防止）', () => {
    // rangeEnd=2026-07-09、now=2026-07-10T00:00Z。UTC-12 の端末ではまだ 07-09 の夜。
    expect(isCacheFresh(cached('2026-07-01T00:00:00.000Z'), '2026-07-09', now)).toBe(false);
    // ただし猶予中でも TTL 内なら有効。
    expect(isCacheFresh(cached('2026-07-09T23:30:00.000Z'), '2026-07-09', now)).toBe(true);
  });

  it('猶予（1日）を過ぎたら確定扱いで永続キャッシュ', () => {
    expect(isCacheFresh(cached('2026-07-01T00:00:00.000Z'), '2026-07-08', now)).toBe(true);
  });

  it('generatedAt が壊れている場合は無効（再生成させる）', () => {
    expect(isCacheFresh(cached('not-a-date'), '2026-07-31', now)).toBe(false);
  });
});

describe('handleGenerateInsight', () => {
  beforeEach(() => {
    vi.mocked(getInsight).mockReset();
    vi.mocked(queryEntriesByDateRange).mockReset();
    vi.mocked(saveInsight).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('type が不正なら invalid-argument', async () => {
    await expect(handleGenerateInsight(ENV, llmStub(), 'u1', { type: 'daily', periodKey: '2026-07' })).rejects.toMatchObject(
      { code: 'invalid-argument' },
    );
  });

  it('periodKey が無ければ invalid-argument', async () => {
    await expect(handleGenerateInsight(ENV, llmStub(), 'u1', { type: 'monthly' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('有効なキャッシュがあれば LLM を呼ばずに返す', async () => {
    const cachedDoc = {
      type: 'monthly',
      periodKey: '2026-01',
      rangeStart: '2026-01-01',
      rangeEnd: '2026-01-31',
      moodDistribution: { calm: 100, tender: 0, heavy: 0 },
      topWords: [],
      narrative: 'キャッシュ済み',
      generatedAt: '2026-02-01T00:00:00.000Z',
      source: { model: 'old-model' },
      schemaVersion: 1,
    } as InsightDoc;
    vi.mocked(getInsight).mockResolvedValue(cachedDoc);
    const llm = llmStub();

    // 2026-01 は既に終了した期間 → 永続キャッシュ。
    const result = await handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' });

    expect(result).toBe(cachedDoc);
    expect(llm.callText).not.toHaveBeenCalled();
    expect(queryEntriesByDateRange).not.toHaveBeenCalled();
    expect(saveInsight).not.toHaveBeenCalled();
  });

  it('期間内にエントリが無ければ failed-precondition（LLM を呼ばない）', async () => {
    vi.mocked(getInsight).mockResolvedValue(null);
    vi.mocked(queryEntriesByDateRange).mockResolvedValue([]);
    const llm = llmStub();

    await expect(handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(llm.callText).not.toHaveBeenCalled();
    expect(saveInsight).not.toHaveBeenCalled();
  });

  it('キャッシュが無ければ集計→生成→保存し、doc を返す', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    vi.mocked(getInsight).mockResolvedValue(null);
    vi.mocked(queryEntriesByDateRange).mockResolvedValue([
      entry('2026-01-05', 'calm', ['雨']),
      entry('2026-01-06', 'heavy', ['雨', '疲れた']),
    ]);
    const llm = llmStub('1月のまとめ');

    const result = await handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' });

    expect(queryEntriesByDateRange).toHaveBeenCalledWith(ENV, 'u1', '2026-01-01', '2026-01-31');
    expect(result).toMatchObject({
      type: 'monthly',
      periodKey: '2026-01',
      rangeStart: '2026-01-01',
      rangeEnd: '2026-01-31',
      moodDistribution: { calm: 50, tender: 0, heavy: 50 },
      topWords: [
        { word: '雨', count: 2 },
        { word: '疲れた', count: 1 },
      ],
      narrative: '1月のまとめ',
      source: { model: 'stub-generate-model' },
      schemaVersion: 1,
    });
    expect(saveInsight).toHaveBeenCalledWith(ENV, 'u1', 'monthly_2026-01', result);
  });

  it('quarterly は直近3ヶ月を集計し quarterly_ プレフィックスで保存する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    vi.mocked(getInsight).mockResolvedValue(null);
    vi.mocked(queryEntriesByDateRange).mockResolvedValue([entry('2026-05-05', 'calm', ['雨'])]);
    const llm = llmStub('3ヶ月のまとめ');

    const result = await handleGenerateInsight(ENV, llm, 'u1', { type: 'quarterly', periodKey: '2026-07' });

    expect(queryEntriesByDateRange).toHaveBeenCalledWith(ENV, 'u1', '2026-05-01', '2026-07-31');
    expect(result).toMatchObject({ type: 'quarterly', periodKey: '2026-07', rangeStart: '2026-05-01', rangeEnd: '2026-07-31' });
    expect(saveInsight).toHaveBeenCalledWith(ENV, 'u1', 'quarterly_2026-07', result);
  });

  it('quarterly は週別内訳（weeklyBreakdown）を含む', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    vi.mocked(getInsight).mockResolvedValue(null);
    vi.mocked(queryEntriesByDateRange).mockResolvedValue([
      entry('2026-05-04', 'calm', []),
      entry('2026-05-05', 'calm', []),
    ]);
    const llm = llmStub();

    const result = await handleGenerateInsight(ENV, llm, 'u1', { type: 'quarterly', periodKey: '2026-07' });

    expect(result.weeklyBreakdown).toBeDefined();
    expect(result.weeklyBreakdown?.[0]).toMatchObject({ weekStart: '2026-04-27' });
    // 週別内訳は集計値のみ（LLMには渡さない、userText には含めない＝下のテストで確認）。
  });

  it('weekly/monthly は週別内訳（weeklyBreakdown）を含まない', async () => {
    vi.mocked(getInsight).mockResolvedValue(null);
    vi.mocked(queryEntriesByDateRange).mockResolvedValue([entry('2026-01-05', 'calm', [])]);
    const llm = llmStub();

    const result = await handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' });

    expect(result.weeklyBreakdown).toBeUndefined();
  });

  it('LLM へ日記本文を渡さない（集計値のみを送る）', async () => {
    vi.mocked(getInsight).mockResolvedValue(null);
    vi.mocked(queryEntriesByDateRange).mockResolvedValue([entry('2026-01-05', 'calm', ['雨'])]);
    const llm = llmStub();

    await handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' });

    const opts = vi.mocked(llm.callText).mock.calls[0][0];
    expect(opts.purpose).toBe('generate');
    const sent = JSON.parse(opts.userText);
    expect(Object.keys(sent).sort()).toEqual(
      ['entryCount', 'instruction', 'moodDistribution', 'periodKey', 'rangeEnd', 'rangeStart', 'topWords', 'type'].sort(),
    );
    expect(opts.userText).not.toContain('bodyText');
  });

  it('同一(uid, periodId)への同時リクエストはLLM呼び出し・保存を1回にまとめる（多重生成の防止）', async () => {
    vi.mocked(getInsight).mockResolvedValue(null);
    // 実際の非同期I/Oを模して、両方の呼び出しが「キャッシュ無し」を観測してから生成に進める
    // ようマイクロタスクを1つ挟む（Promise.resolve().then）。
    vi.mocked(queryEntriesByDateRange).mockImplementation(async () => {
      await Promise.resolve();
      return [entry('2026-01-05', 'calm', [])];
    });
    const llm = llmStub();

    const [a, b] = await Promise.all([
      handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' }),
      handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' }),
    ]);

    expect(a).toBe(b); // 同一Promiseに相乗りするため同一オブジェクト。
    expect(llm.callText).toHaveBeenCalledTimes(1);
    expect(saveInsight).toHaveBeenCalledTimes(1);
  });

  it('異なるperiodIdへの同時リクエストはそれぞれ独立して生成する', async () => {
    vi.mocked(getInsight).mockResolvedValue(null);
    vi.mocked(queryEntriesByDateRange).mockResolvedValue([entry('2026-01-05', 'calm', [])]);
    const llm = llmStub();

    const [monthly, weekly] = await Promise.all([
      handleGenerateInsight(ENV, llm, 'u1', { type: 'monthly', periodKey: '2026-01' }),
      handleGenerateInsight(ENV, llm, 'u1', { type: 'weekly', periodKey: '2026-W02' }),
    ]);

    expect(monthly).not.toBe(weekly);
    expect(llm.callText).toHaveBeenCalledTimes(2);
  });
});
