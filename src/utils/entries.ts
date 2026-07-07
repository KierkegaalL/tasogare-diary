import type { MoodLevel } from '../theme';
import type { DiaryEntry } from '../types/diary';

// 日付→感情ラベルの索引。entries は新しい順のため、同一日付は先勝ち（＝最新優先）。
export function buildMoodByDate(entries: DiaryEntry[]): Map<string, MoodLevel | null> {
  const map = new Map<string, MoodLevel | null>();
  for (const entry of entries) {
    if (!map.has(entry.date)) map.set(entry.date, entry.mood);
  }
  return map;
}
