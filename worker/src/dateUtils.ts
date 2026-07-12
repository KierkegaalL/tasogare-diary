// 日付ユーティリティ（insight.ts の集計と cron.ts の期間キー算出で共有）。
// すべて UTC 基準で扱う（呼び出し側が必要なオフセットを与える）。

export const DAY_MS = 24 * 60 * 60 * 1000;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// エポックミリ秒 → YYYY-MM-DD（UTC）。
export function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
