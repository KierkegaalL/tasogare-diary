import { describe, expect, it } from 'vitest';

import { currentPeriodKey, formatEntryDate, isoWeek, monthlyKey, weeklyKey } from '../period';

describe('isoWeek/weeklyKey', () => {
  it('年末年始・月境界・閏年を含む代表日でISO週番号を計算する', () => {
    // worker/src/__tests__/cron.test.ts の isoWeekKey 検証と同じ代表日（クライアント/サーバの
    // periodKey算出が食い違わないことの確認を兼ねる）。
    expect(weeklyKey(new Date(2026, 0, 1))).toBe('2026-W01'); // 木曜
    expect(weeklyKey(new Date(2025, 11, 29))).toBe('2026-W01'); // 月曜、ISOでは2026-W01
    expect(weeklyKey(new Date(2026, 6, 12))).toBe('2026-W28'); // 日曜
    expect(weeklyKey(new Date(2024, 11, 31))).toBe('2025-W01'); // 火曜、ISOでは2025-W01
    expect(weeklyKey(new Date(2027, 0, 3))).toBe('2026-W53'); // 日曜、ISOでは2026-W53
  });

  it('isoWeek は year/week の組を返す', () => {
    expect(isoWeek(new Date(2026, 6, 12))).toEqual({ year: 2026, week: 28 });
  });
});

describe('monthlyKey', () => {
  it('YYYY-MM を返す（月は0始まりのDateから1始まりへ変換）', () => {
    expect(monthlyKey(new Date(2026, 0, 15))).toBe('2026-01');
    expect(monthlyKey(new Date(2026, 11, 1))).toBe('2026-12');
  });
});

describe('currentPeriodKey', () => {
  it('weekly は weeklyKey、monthly/quarterly は monthlyKey を使う', () => {
    const now = new Date(2026, 6, 12); // 2026-07-12（日）
    expect(currentPeriodKey('weekly', now)).toBe(weeklyKey(now));
    expect(currentPeriodKey('monthly', now)).toBe('2026-07');
    expect(currentPeriodKey('quarterly', now)).toBe('2026-07');
  });
});

describe('formatEntryDate', () => {
  it('YYYY-MM-DD を「M月D日（曜日）」形式にする', () => {
    // 2026-07-09は木曜日。
    expect(formatEntryDate('2026-07-09')).toBe('7月9日（木）');
  });

  it('ゼロ埋めされた月日でも数値として表示する（先頭ゼロを付けない）', () => {
    expect(formatEntryDate('2026-01-05')).toBe('1月5日（月）');
  });
});
