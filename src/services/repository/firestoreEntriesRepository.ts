import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

import type { EntriesRepository } from './types';
import type { DiaryEntry } from '../../types/diary';
import { getFirestoreDb } from '../firestore/db';

// Firestore 実装（uid スコープ: users/{uid}/entries）。
// id は自動生成（data.md 3.2）＝ ドキュメントIDで表現し、1日1件（U-11）は date クエリで担保する。
// isFirebaseConfigured=true のときのみ getEntriesRepository から読み込まれる。
const entriesCol = (uid: string) => collection(getFirestoreDb(), 'users', uid, 'entries');

// ドキュメントID を id に復元（doc には id フィールドを保存しない）。
const fromDoc = (id: string, data: DocumentData): DiaryEntry =>
  ({ ...(data as Omit<DiaryEntry, 'id'>), id }) as DiaryEntry;

export const firestoreEntriesRepository: EntriesRepository = {
  subscribe(uid, onChange) {
    const q = query(entriesCol(uid), orderBy('date', 'desc'));
    return onSnapshot(
      q,
      (snap) => onChange(snap.docs.map((d) => fromDoc(d.id, d.data()))),
      (error) => console.warn('[firestore] entries subscribe error:', error.message),
    );
  },
  async upsert(uid, entry) {
    // 同一 date の既存ドキュメントがあればそれを更新（1日1件）。無ければ自動ID（entry.id）で新規。
    const dup = await getDocs(query(entriesCol(uid), where('date', '==', entry.date), limit(1)));
    const existing = dup.docs[0];
    const docId = existing ? existing.id : entry.id;
    const createdAt = existing ? ((existing.data().createdAt as string) ?? entry.createdAt) : entry.createdAt;
    const data: DocumentData = { ...entry, createdAt };
    delete (data as { id?: string }).id; // id は docId で表現（冗長フィールドを保存しない）
    await setDoc(doc(entriesCol(uid), docId), data);
  },
  async remove(uid, id) {
    await deleteDoc(doc(entriesCol(uid), id));
  },
};
