import type { AdjustInstruction, GenerateDiaryResponse } from '../../../services/diaryApi';
import type { DiaryEntry, DiaryWord } from '../../../types/diary';

export interface BuildDiaryEntryParams {
  id: string;
  date: string; // YYYY-MM-DD
  display: GenerateDiaryResponse;
  requestWords: DiaryWord[];
  awareness?: string;
  appliedAdjustments: AdjustInstruction[];
  now: string; // ISO8601（createdAt/updatedAt に使う）
}

// PreviewScreen の保存（onSave）で使う純粋関数（data.md 3.2）。
// source は常に付与（未生成のまま保存されることは無い設計）。adjustments は空なら省略する
// （Firestore は undefined フィールドの書込を許容しないため。firestoreEntriesRepository.ts）。
export function buildDiaryEntry({
  id,
  date,
  display,
  requestWords,
  awareness,
  appliedAdjustments,
  now,
}: BuildDiaryEntryParams): DiaryEntry {
  return {
    id,
    date,
    mood: display.mood,
    words: requestWords,
    bodyText: display.bodyText,
    ...(awareness ? { awareness } : {}),
    ...(appliedAdjustments.length > 0 ? { adjustments: appliedAdjustments } : {}),
    source: { model: display.model, promptVersion: display.promptVersion },
    createdAt: now,
    updatedAt: now,
  };
}
