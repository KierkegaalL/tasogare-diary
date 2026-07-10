import type { InsightType } from '@shared/types/insight';

// 期間キーの算出（api-contract.md 3.5：weekly=YYYY-Www[ISO週・月曜始まり] / monthly=YYYY-MM）。
// ダッシュボードの期間タブ（screen.md 4.1）に対応する。

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ISO8601 週番号（月曜始まり、木曜を含む週がその年の週）。
export function isoWeek(date: Date): { year: number; week: number } {
  // UTC 基準で計算し、曜日ずれを避ける。
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // 月曜=1 … 日曜=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // その週の木曜へ移動
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}

export function weeklyKey(date: Date): string {
  const { year, week } = isoWeek(date);
  return `${year}-W${pad2(week)}`;
}

export function monthlyKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function currentPeriodKey(type: InsightType, now: Date = new Date()): string {
  return type === 'weekly' ? weeklyKey(now) : monthlyKey(now);
}

// タブ表示ラベル（screen.md 4.1：今週 / 今月）。
export const PERIOD_LABELS: Record<InsightType, string> = {
  weekly: '今週',
  monthly: '今月',
};
