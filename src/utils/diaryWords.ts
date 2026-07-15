import type { DiaryWord } from '../types/diary';

// 語群の同一性判定キー（順序・category+text で構成）。useGenerateDiary の queryKey と
// PreviewScreen の再訪検知（wordsKey）の両方で同じ基準を使う必要があるため共通化する。
export function wordsKey(words: DiaryWord[]): string {
  return words.map((w) => `${w.category}:${w.text}`).join('|');
}
