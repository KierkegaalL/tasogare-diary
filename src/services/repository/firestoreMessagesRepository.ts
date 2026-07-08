import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

import type { MessagesRepository } from './types';
import type { ChatMessage } from '../../types/diary';
import { getFirestoreDb } from '../firestore/db';

// Firestore 実装（uid スコープ: users/{uid}/entries/{entryId}/messages、data.md 3.3）。
// isFirebaseConfigured=true のときのみ getMessagesRepository から読み込まれる。
// message.id をそのままドキュメントIDに用いる（楽観追加のロールバックで id 指定削除するため）。
const messagesCol = (uid: string, entryId: string) =>
  collection(getFirestoreDb(), 'users', uid, 'entries', entryId, 'messages');

const fromDoc = (id: string, data: DocumentData): ChatMessage =>
  ({ ...(data as Omit<ChatMessage, 'id'>), id }) as ChatMessage;

export const firestoreMessagesRepository: MessagesRepository = {
  subscribe(uid, entryId, onChange) {
    const q = query(messagesCol(uid, entryId), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => onChange(snap.docs.map((d) => fromDoc(d.id, d.data()))),
      (error) => console.warn('[firestore] messages subscribe error:', error.message),
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
