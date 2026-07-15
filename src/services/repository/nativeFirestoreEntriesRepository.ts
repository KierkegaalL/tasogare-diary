import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from '@react-native-firebase/firestore';
import type { DocumentData } from '@react-native-firebase/firestore';

import type { EntriesRepository } from './types';
import type { DiaryEntry } from '../../types/diary';

// @react-native-firebase/firestore 版の実装（migration-react-native-firebase.md 第6章）。
// firestoreEntriesRepository.ts（Firebase JS SDK版）とロジックは同一で、import元のみが異なる
// （modular API は firebase/firestore とほぼ同じ関数シグネチャのため）。オフライン永続化は
// ネイティブSDKの既定設定（persistence: true）で自動的に有効になる。
// getEntriesRepository()（./index.ts）から shouldUseNativeFirebase() 有効時のみ動的 require される。
const entriesCol = (uid: string) => collection(getFirestore(), 'users', uid, 'entries');

const fromDoc = (id: string, data: DocumentData): DiaryEntry =>
  ({ ...(data as Omit<DiaryEntry, 'id'>), id }) as DiaryEntry;

export const nativeFirestoreEntriesRepository: EntriesRepository = {
  subscribe(uid, onChange) {
    const q = query(entriesCol(uid), orderBy('date', 'desc'));
    return onSnapshot(
      q,
      (snap) => onChange(snap.docs.map((d) => fromDoc(d.id, d.data()))),
      // @react-native-firebase の FirestoreError 型定義は Error のエイリアスで code を持たないが、
      // 実行時のネイティブエラーは他プロバイダ同様 code を持つ（PreviewScreen.tsx と同じキャスト）。
      (error) => console.warn('[native firestore] entries subscribe error:', (error as { code?: string }).code),
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
