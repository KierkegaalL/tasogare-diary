import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DiaryEntry } from '../types/diary';

interface EntriesState {
  entries: DiaryEntry[];
  hasHydrated: boolean;
  addEntry: (entry: DiaryEntry) => void;
  removeEntry: (id: string) => void;
  getEntry: (id: string) => DiaryEntry | undefined;
}

// 保存済み日記のローカルストア（Phase1）。
// data.md では Firestore users/{uid}/entries が正だが、Phase1 は端末ローカルに永続する。
// Phase2 で Firestore（＋オフライン同期）へ差し替える。永続は AsyncStorage（Expo Go 互換）。
export const useEntriesStore = create<EntriesState>()(
  persist(
    (set, get) => ({
      entries: [],
      hasHydrated: false,
      // 1日1件（U-11）: 同一 date の既存エントリがあれば置き換える（id/createdAt は維持）。
      // 新しい順に先頭へ配置する。
      addEntry: (entry) =>
        set((state) => {
          const existing = state.entries.find((e) => e.date === entry.date);
          const merged: DiaryEntry = existing
            ? { ...entry, id: existing.id, createdAt: existing.createdAt }
            : entry;
          const rest = state.entries.filter((e) => e.date !== entry.date);
          return { entries: [merged, ...rest] };
        }),
      removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
      getEntry: (id) => get().entries.find((e) => e.id === id),
    }),
    {
      name: 'tasogare-entries',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
    },
  ),
);
