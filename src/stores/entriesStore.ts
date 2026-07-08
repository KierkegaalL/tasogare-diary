import { create } from 'zustand';

import type { DiaryEntry } from '../types/diary';
import { getEntriesRepository } from '../services/repository';

interface EntriesState {
  entries: DiaryEntry[];
  hasHydrated: boolean;
  /** uid の購読を開始（認証確立後に呼ぶ）。以前の購読は解除する。 */
  bootstrap: (uid: string) => void;
  teardown: () => void;
  addEntry: (uid: string, entry: DiaryEntry) => Promise<void>;
  removeEntry: (uid: string, id: string) => Promise<void>;
  getEntry: (id: string) => DiaryEntry | undefined;
}

// 保存済み日記のストア（Phase2）。永続はリポジトリ層（ローカル/Firestore）に委譲し、
// UI は本ストアを購読して表示する（data.md 第6章、architecture.md 第4章）。
let unsubscribe: (() => void) | undefined;

export const useEntriesStore = create<EntriesState>((set, get) => ({
  entries: [],
  hasHydrated: false,
  bootstrap: (uid) => {
    unsubscribe?.();
    unsubscribe = getEntriesRepository().subscribe(uid, (entries) => {
      set({ entries, hasHydrated: true });
    });
  },
  teardown: () => {
    unsubscribe?.();
    unsubscribe = undefined;
    // サインアウト等で uid が失われた際、前ユーザーの表示が残らないようクリアする。
    set({ entries: [], hasHydrated: false });
  },
  addEntry: async (uid, entry) => {
    await getEntriesRepository().upsert(uid, entry);
  },
  removeEntry: async (uid, id) => {
    await getEntriesRepository().remove(uid, id);
  },
  getEntry: (id) => get().entries.find((e) => e.id === id),
}));
