import type { MoodLevel } from '../theme/tokens';

// 週次/月次/過去3ヶ月まとめ（data.md 第3.5節 / api-contract.md 第3.5節）。
// weekly はモバイル⑥カレンダー、monthly / quarterly は Web ダッシュボード⑩で使う。
// quarterly は「過去3ヶ月」（screen.md 4.1）。periodKey は monthly と同じ YYYY-MM で末尾の月
// （＝今月）を表し、その月を含む直近3ヶ月を集計する（暦上の四半期ではない）。
export type InsightType = 'weekly' | 'monthly' | 'quarterly';

// 百分率（整数・合計100）。mood が null のエントリは母数から除外される。
export type MoodDistribution = Record<MoodLevel, number>;

export interface TopWord {
  word: string;
  count: number;
}

export interface Insight {
  type: InsightType;
  periodKey: string; // weekly: YYYY-Www / monthly・quarterly: YYYY-MM（quarterly は末尾の月）
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD
  moodDistribution: MoodDistribution;
  topWords: TopWord[]; // 最大10件・件数降順
  narrative: string;
  generatedAt: string; // ISO8601
  source?: { model: string };
  schemaVersion: number;
}
