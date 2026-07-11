import { collection, getDocs, limit, orderBy, query, startAfter } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
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

export interface EntriesPage {
  entries: DiaryEntry[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

// 日記一覧を date 降順で 1 ページ分取得する（無限スクロール用）。
// cursor（前ページ最後の doc）を渡すと続きから取得する。hasMore 判定のため pageSize+1 件取得して余りを捨てる。
export async function fetchEntriesPage(
  uid: string,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
  pageSize: number,
): Promise<EntriesPage> {
  const constraints = [orderBy('date', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize + 1)];
  const q = query(collection(getDb(), 'users', uid, 'entries'), ...constraints);
  const snap = await getDocs(q);
  const docs = snap.docs.slice(0, pageSize);
  return {
    entries: docs.map((d) => fromDoc(d.id, d.data())),
    cursor: docs.at(-1) ?? null,
    hasMore: snap.docs.length > pageSize,
  };
}
