import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from '@react-native-firebase/firestore';
import type { DocumentData } from '@react-native-firebase/firestore';

import type { MessagesRepository } from './types';
import type { ChatMessage } from '../../types/diary';

// @react-native-firebase/firestore 版の実装（migration-react-native-firebase.md 第6章）。
// firestoreMessagesRepository.ts（Firebase JS SDK版）とロジックは同一（nativeFirestoreEntriesRepository.ts
// 参照）。getMessagesRepository()（./index.ts）から shouldUseNativeFirebase() 有効時のみ動的 require される。
const messagesCol = (uid: string, entryId: string) =>
  collection(getFirestore(), 'users', uid, 'entries', entryId, 'messages');

const fromDoc = (id: string, data: DocumentData): ChatMessage =>
  ({ ...(data as Omit<ChatMessage, 'id'>), id }) as ChatMessage;

export const nativeFirestoreMessagesRepository: MessagesRepository = {
  subscribe(uid, entryId, onChange) {
    const q = query(messagesCol(uid, entryId), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => onChange(snap.docs.map((d) => fromDoc(d.id, d.data()))),
      // @react-native-firebase の FirestoreError 型定義は Error のエイリアスで code を持たないが、
      // 実行時のネイティブエラーは他プロバイダ同様 code を持つ（PreviewScreen.tsx と同じキャスト）。
      (error) =>
        console.warn('[native firestore] messages subscribe error:', (error as { code?: string }).code),
    );
  },
  async add(uid, entryId, message) {
    const data: DocumentData = { ...message };
    delete (data as { id?: string }).id; // id は docId で表現（冗長フィールドを保存しない）
    await setDoc(doc(messagesCol(uid, entryId), message.id), data);
  },
  async remove(uid, entryId, messageId) {
    await deleteDoc(doc(messagesCol(uid, entryId), messageId));
  },
};
