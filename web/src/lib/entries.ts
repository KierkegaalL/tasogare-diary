import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { MOOD_LEVELS, type MoodLevel } from '@shared/theme/tokens';

import { getDb } from './firebase';

// 日記エントリの直読（Firestore users/{uid}/entries／data.md 3.2）。
// firestore.rules は本人（uid 一致）に read/write 双方を許可するが、Web は閲覧専用（U-09）とする
// 運用方針のため、本クライアントからは read（getDocs）しか呼ばない。書込はモバイルが担う。

export type WordCategory = 'mood' | 'event' | 'assoc';

export interface DiaryWord {
  text: string;
  category?: WordCategory;
  source?: 'selected' | 'typed';
}

// data.md 3.2 のうち、閲覧表示に使うフィールドのみを持つ Web ローカル型。
// （モバイルは src/types/diary.ts に独自定義。共有型にしないのはデッドコードを増やさないため。）
export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mood: MoodLevel | null;
  words: DiaryWord[];
  bodyText: string;
  awareness?: string;
}

// 既知の感情ラベルのみ受理する（未知値は null 扱い＝moodColor/moodLabel の未定義参照を防ぐ）。
function toMoodLevel(value: unknown): MoodLevel | null {
  return MOOD_LEVELS.includes(value as MoodLevel) ? (value as MoodLevel) : null;
}

// text を持つ要素だけを選択語として採用する（旧スキーマ等の壊れた要素で空タグが出ないように）。
function toWords(value: unknown): DiaryWord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((w): w is DiaryWord => typeof (w as DiaryWord | undefined)?.text === 'string');
}

function fromDoc(id: string, data: DocumentData): DiaryEntry {
  return {
    id,
    date: typeof data.date === 'string' ? data.date : '',
    mood: toMoodLevel(data.mood),
    words: toWords(data.words),
    bodyText: typeof data.bodyText === 'string' ? data.bodyText : '',
    awareness: typeof data.awareness === 'string' ? data.awareness : undefined,
  };
}

// 指定月（YYYY-MM）のエントリを date 降順で取得する。
// date は文字列なので辞書順の範囲比較で月内を絞り込む（同一フィールドの範囲＋並び替えのため複合インデックス不要）。
export async function fetchEntriesForMonth(uid: string, monthKey: string): Promise<DiaryEntry[]> {
  const q = query(
    collection(getDb(), 'users', uid, 'entries'),
    where('date', '>=', `${monthKey}-01`),
    where('date', '<=', `${monthKey}-31`), // '2026-02-31' でも辞書順で月末日以下を包含する
    orderBy('date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}
