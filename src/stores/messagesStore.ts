import { create } from 'zustand';

import type { ChatMessage } from '../types/diary';
import { getMessagesRepository } from '../services/repository';

interface MessagesState {
  messagesByEntry: Record<string, ChatMessage[]>;
  hydratedEntries: Record<string, boolean>;
  /** entryId の購読を開始する（画面表示時に呼ぶ）。以前の同一 entryId 購読は解除する。 */
  bootstrap: (uid: string, entryId: string) => void;
  teardown: (entryId: string) => void;
  addMessage: (uid: string, entryId: string, message: ChatMessage) => Promise<void>;
  removeMessage: (uid: string, entryId: string, messageId: string) => Promise<void>;
}

// AI対話メッセージのストア（Phase2）。永続はリポジトリ層（ローカル/Firestore）に委譲し、
// UI は本ストアを購読して表示する（U-05: 会話履歴は保存する、data.md 3.3）。
// entryId ごとに購読するため、entryId をキーに unsubscribe を管理する（uid は含めない）。
// 前提: 認証中の uid は常に単一（同時に複数 uid でログインする経路は無い）。
const unsubscribers = new Map<string, () => void>();

export const useMessagesStore = create<MessagesState>((set) => ({
  messagesByEntry: {},
  hydratedEntries: {},
  bootstrap: (uid, entryId) => {
    unsubscribers.get(entryId)?.();
    const unsub = getMessagesRepository().subscribe(uid, entryId, (messages) => {
      set((state) => ({
        messagesByEntry: { ...state.messagesByEntry, [entryId]: messages },
        hydratedEntries: { ...state.hydratedEntries, [entryId]: true },
      }));
    });
    unsubscribers.set(entryId, unsub);
  },
  teardown: (entryId) => {
    unsubscribers.get(entryId)?.();
    unsubscribers.delete(entryId);
    set((state) => {
      const messagesByEntry = { ...state.messagesByEntry };
      const hydratedEntries = { ...state.hydratedEntries };
      delete messagesByEntry[entryId];
      delete hydratedEntries[entryId];
      return { messagesByEntry, hydratedEntries };
    });
  },
  addMessage: async (uid, entryId, message) => {
    await getMessagesRepository().add(uid, entryId, message);
  },
  removeMessage: async (uid, entryId, messageId) => {
    await getMessagesRepository().remove(uid, entryId, messageId);
  },
}));
