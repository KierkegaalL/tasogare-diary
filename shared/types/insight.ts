import type { MoodLevel } from '../theme/tokens';

// 週次/月次まとめ（data.md 第3.5節 / api-contract.md 第3.5節）。
// weekly はモバイル⑥カレンダー、monthly は Web ダッシュボード⑩で使う。
export type InsightType = 'weekly' | 'monthly';

// 百分率（整数・合計100）。mood が null のエントリは母数から除外される。
export type MoodDistribution = Record<MoodLevel, number>;

export interface TopWord {
  word: string;
  count: number;
}

export interface Insight {
  type: InsightType;
  periodKey: string; // weekly: YYYY-Www / monthly: YYYY-MM
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD
  moodDistribution: MoodDistribution;
  topWords: TopWord[]; // 最大10件・件数降順
  narrative: string;
  generatedAt: string; // ISO8601
  source?: { model: string };
  schemaVersion: number;
}
