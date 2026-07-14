import { beforeEach, describe, expect, it, vi } from 'vitest';

// handleGenerateInsight（LLM/Firestore を叩く）と listUserIds / getLlmProvider はモックし、
// cron.ts のオーケストレーション（列挙→期間キー算出→集計）を単体で検証する。
// ApiError と periodRange は実物を使う（instanceof 判定・round-trip 検証のため importActual）。
vi.mock('../firestore', () => ({ listUserIds: vi.fn() }));
vi.mock('../insight', async (orig) => ({
  ...(await orig<typeof import('../insight')>()),
  handleGenerateInsight: vi.fn(),
}));
vi.mock('../llm', async (orig) => ({
  ...(await orig<typeof import('../llm')>()),
  getLlmProvider: vi.fn(),
}));

import { currentPeriodKey, parseInsightTypes, safeMaxUsers, handleScheduled } from '../cron';
import { periodRange } from '../insight';
import { handleGenerateInsight } from '../insight';
import { listUserIds } from '../firestore';
import { getLlmProvider, ApiError } from '../llm';
import type { Env } from '../env';
import type { LlmProvider } from '../llm';

const listUserIdsMock = vi.mocked(listUserIds);
const handleGenerateInsightMock = vi.mocked(handleGenerateInsight);
const getLlmProviderMock = vi.mocked(getLlmProvider);

const LLM = { name: 'stub' } as unknown as LlmProvider;

beforeEach(() => {
  vi.clearAllMocks();
  getLlmProviderMock.mockReturnValue(LLM);
  handleGenerateInsightMock.mockResolvedValue({} as never);
});

describe('currentPeriodKey', () => {
  it('monthly/quarterly は末尾月の YYYY-MM を返す', () => {
    expect(currentPeriodKey('monthly', new Date('2026-07-12T15:00:00Z'))).toBe('2026-07');
    expect(currentPeriodKey('quarterly', new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('weekly は ISO 週キーを返し、その範囲は当日を含む（weeklyRange と round-trip）', () => {
    // 年末年始・月境界・平年/閏年を含む代表日で round-trip を検証する。
    const dates = [
      '2026-01-01', // 木曜（2026-W01）
      '2025-12-29', // 月曜、ISO では 2026-W01
      '2026-07-12', // 日曜
      '2024-12-31', // 火曜、ISO では 2025-W01
      '2027-01-03', // 日曜、ISO では 2026-W53
    ];
    for (const d of dates) {
      const at = new Date(`${d}T12:00:00Z`);
      const key = currentPeriodKey('weekly', at);
      expect(key).toMatch(/^\d{4}-W\d{2}$/);
      const { rangeStart, rangeEnd } = periodRange('weekly', key);
      expect(rangeStart <= d && d <= rangeEnd).toBe(true);
    }
  });
});

describe('parseInsightTypes', () => {
  it('未設定は既定 weekly,monthly', () => {
    expect(parseInsightTypes(undefined)).toEqual(['weekly', 'monthly']);
    expect(parseInsightTypes('')).toEqual(['weekly', 'monthly']);
  });

  it('カンマ区切りを検証し、空白除去・不正値除外・重複排除する', () => {
    expect(parseInsightTypes('weekly, quarterly ,weekly')).toEqual(['weekly', 'quarterly']);
    expect(parseInsightTypes('bogus,monthly')).toEqual(['monthly']);
  });

  it('有効値が1つも無ければ既定に戻す', () => {
    expect(parseInsightTypes('bogus,,x')).toEqual(['weekly', 'monthly']);
  });
});

describe('safeMaxUsers', () => {
  it('既定設定（20ユーザー×既定2タイプ）はCloudflare無料枠のサブリクエスト上限50を超えない', () => {
    const users = safeMaxUsers(20, 2);
    expect(users * 2 * 4).toBeLessThanOrEqual(50);
  });

  it('設定値が安全上限より小さい場合は設定値をそのまま使う', () => {
    expect(safeMaxUsers(3, 1)).toBe(3);
  });

  it('タイプ数が多いほど安全な処理ユーザー数は減る', () => {
    const forOneType = safeMaxUsers(100, 1);
    const forThreeTypes = safeMaxUsers(100, 3);
    expect(forThreeTypes).toBeLessThan(forOneType);
  });

  it('最低でも1ユーザー分は確保する', () => {
    expect(safeMaxUsers(100, 100)).toBeGreaterThanOrEqual(1);
  });
});

describe('handleScheduled', () => {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const at = Date.UTC(2026, 6, 12, 15, 0, 0); // 2026-07-12 15:00Z ＝ 2026-07-13 00:00 JST
  const jstAt = new Date(at + JST_OFFSET_MS);

  it('列挙した全ユーザー×既定タイプで handleGenerateInsight を呼ぶ', async () => {
    listUserIdsMock.mockResolvedValue(['u1', 'u2']);

    const result = await handleScheduled({} as Env, at);

    // 2ユーザー × 2タイプ（weekly/monthly）＝ 4 件生成。
    expect(result).toEqual({ users: 2, generated: 4, skippedNoEntries: 0, errors: 0 });
    expect(handleGenerateInsightMock).toHaveBeenCalledTimes(4);
    // LLM プロバイダはユーザーごとではなく1回だけ解決する。
    expect(getLlmProviderMock).toHaveBeenCalledTimes(1);
    // 現在期間キー（JST 壁時計）が渡っている。
    expect(handleGenerateInsightMock).toHaveBeenCalledWith({}, LLM, 'u1', {
      type: 'weekly',
      periodKey: currentPeriodKey('weekly', jstAt),
    });
    expect(handleGenerateInsightMock).toHaveBeenCalledWith({}, LLM, 'u1', {
      type: 'monthly',
      periodKey: '2026-07',
    });
  });

  it('JST 壁時計で現在期間を決める（UTC 15:00 の月境界では翌月キーになる）', async () => {
    listUserIdsMock.mockResolvedValue(['u1']);
    // 2026-07-31T15:00:00Z ＝ 2026-08-01 00:00 JST。UTC のままだと 2026-07 になってしまう。
    await handleScheduled({ CRON_INSIGHT_TYPES: 'monthly' } as unknown as Env, Date.UTC(2026, 6, 31, 15, 0, 0));

    expect(handleGenerateInsightMock).toHaveBeenCalledWith(expect.anything(), LLM, 'u1', {
      type: 'monthly',
      periodKey: '2026-08',
    });
  });

  it('CRON_MAX_USERS を listUserIds へ渡し、CRON_INSIGHT_TYPES でタイプを絞る', async () => {
    listUserIdsMock.mockResolvedValue(['u1']);

    await handleScheduled({ CRON_MAX_USERS: '5', CRON_INSIGHT_TYPES: 'quarterly' } as unknown as Env, at);

    expect(listUserIdsMock).toHaveBeenCalledWith({ CRON_MAX_USERS: '5', CRON_INSIGHT_TYPES: 'quarterly' }, 5);
    expect(handleGenerateInsightMock).toHaveBeenCalledTimes(1);
    expect(handleGenerateInsightMock).toHaveBeenCalledWith(expect.anything(), LLM, 'u1', {
      type: 'quarterly',
      periodKey: '2026-07',
    });
  });

  it('日記が無いユーザー（failed-precondition）はスキップ扱い', async () => {
    listUserIdsMock.mockResolvedValue(['u1']);
    handleGenerateInsightMock.mockRejectedValue(new ApiError(400, 'failed-precondition', 'no entries'));

    const result = await handleScheduled({} as Env, at);

    expect(result).toEqual({ users: 1, generated: 0, skippedNoEntries: 2, errors: 0 });
  });

  it('その他の失敗は errors に計上し、1件の失敗で全体は止めない', async () => {
    listUserIdsMock.mockResolvedValue(['u1', 'u2']);
    handleGenerateInsightMock.mockImplementation(async (_env, _llm, uid) => {
      if (uid === 'u1') throw new Error('boom');
      return {} as never;
    });

    const result = await handleScheduled({} as Env, at);

    // u1 は weekly/monthly とも失敗（errors=2）、u2 は両方成功（generated=2）。
    expect(result).toEqual({ users: 2, generated: 2, skippedNoEntries: 0, errors: 2 });
  });

  it('ユーザーが居なければ何も生成しない', async () => {
    listUserIdsMock.mockResolvedValue([]);

    const result = await handleScheduled({} as Env, at);

    expect(result).toEqual({ users: 0, generated: 0, skippedNoEntries: 0, errors: 0 });
    expect(handleGenerateInsightMock).not.toHaveBeenCalled();
  });
});
