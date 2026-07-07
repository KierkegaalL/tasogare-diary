import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChatMessage } from '../types/diary';

interface MessagesState {
  messagesByEntry: Record<string, ChatMessage[]>;
  hasHydrated: boolean;
  addMessage: (entryId: string, message: ChatMessage) => void;
  removeMessage: (entryId: string, messageId: string) => void;
  // 非リアクティブな取得（テスト・イベントハンドラ用）。描画では selector を使うこと。
  getMessages: (entryId: string) => ChatMessage[];
}

// AI対話メッセージのローカルストア（U-05: 会話履歴は保存する）。
// data.md では users/{uid}/entries/{entryId}/messages が正。Phase2 で Firestore へ差し替え。
export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => ({
      messagesByEntry: {},
      hasHydrated: false,
      addMessage: (entryId, message) =>
        set((state) => ({
          messagesByEntry: {
            ...state.messagesByEntry,
            [entryId]: [...(state.messagesByEntry[entryId] ?? []), message],
          },
        })),
      removeMessage: (entryId, messageId) =>
        set((state) => ({
          messagesByEntry: {
            ...state.messagesByEntry,
            [entryId]: (state.messagesByEntry[entryId] ?? []).filter((m) => m.id !== messageId),
          },
        })),
      getMessages: (entryId) => get().messagesByEntry[entryId] ?? [],
    }),
    {
      name: 'tasogare-messages',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ messagesByEntry: state.messagesByEntry }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
    },
  ),
);
