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

// 調整の種類（api-contract.md 3.3 adjustDiary の instruction）。
export type AdjustInstruction = 'positive' | 'shorter' | 'detailed';

// 生成メタ（data.md 3.2 entries.source）。本文は保持するが送信ログは残さない（api-contract.md 第8章）。
export interface DiaryEntrySource {
  model: string;
  promptVersion: string;
}

// 保存済みエントリ（Firestore users/{uid}/entries/{entryId} に対応）。
export interface DiaryEntry extends Required<Pick<DiaryDraft, 'words' | 'bodyText'>> {
  id: string;
  date: string; // YYYY-MM-DD
  mood: MoodLevel | null;
  awareness?: string;
  // 適用した調整の履歴（data.md 3.2 entries.adjustments）。未調整なら省略。
  adjustments?: AdjustInstruction[];
  // 生成に使ったモデル/プロンプト版（追跡可能性のため。api-contract.md 第8章）。未生成（旧データ）なら省略。
  source?: DiaryEntrySource;
  createdAt: string;
  updatedAt: string;
}

// AI対話メッセージ（data.md 3.3 messages）。UI 由来のロール ai/me を用いる。
export type ChatRole = 'ai' | 'me';
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
}
