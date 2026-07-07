import type { MoodLevel } from '../theme/colors';

// data.md 第3.2節に対応する型（クライアント側の下書き/エントリ表現）。
export type WordCategory = 'mood' | 'event' | 'assoc';
export type WordSource = 'selected' | 'typed';

export interface DiaryWord {
  text: string;
  category: WordCategory;
  source: WordSource;
}

// 4ステップ入力の途中状態（draftStore が保持）。
export interface DiaryDraft {
  mood?: string; // きもち（自由語/選択語の原文）
  words: DiaryWord[]; // できごと・ことばの選択語群
  bodyText?: string; // たしかめるで生成した本文
  moodLevel?: MoodLevel | null; // Claude 推定の感情ラベル
  awareness?: string; // 灯ステップの気づき一言
}

// 保存済みエントリ（Firestore users/{uid}/entries/{entryId} に対応）。
export interface DiaryEntry extends Required<Pick<DiaryDraft, 'words' | 'bodyText'>> {
  id: string;
  date: string; // YYYY-MM-DD
  mood: MoodLevel | null;
  awareness?: string;
  createdAt: string;
  updatedAt: string;
}
