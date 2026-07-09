import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { DiaryDraft, DiaryWord, WordSource } from '../types/diary';
import type { MoodLevel } from '../theme/colors';
import { storage } from '../services/storage';

interface DraftState extends DiaryDraft {
  /** ローカル永続からの復元完了フラグ（constraints.md: オフラインでも下書き継続）。 */
  hasHydrated: boolean;
  setMood: (mood: string | undefined) => void;
  /** できごと（category='event'）は単一選択。既存の event 語を置き換える。undefined で解除。 */
  setEventWord: (text: string | undefined, source?: WordSource) => void;
  addWord: (word: DiaryWord) => void;
  removeWord: (text: string) => void;
  setBodyText: (bodyText: string) => void;
  setMoodLevel: (level: MoodLevel | null) => void;
  setAwareness: (awareness: string) => void;
  reset: () => void;
}

// zustand の set は浅いマージのため、reset で確実にクリアできるよう全フィールドを明示する。
const initialDraft: DiaryDraft = {
  mood: undefined,
  words: [],
  bodyText: undefined,
  moodLevel: undefined,
  awareness: undefined,
};

const DRAFT_STORAGE_KEY = 'tasogare-draft';

// 4ステップ日記フローの下書き状態（architecture.md 第4.2節 draftStore）。
// zustand persist で services/storage（AsyncStorage）へ永続化し、オフラインでも下書きが失われない
// ようにする（constraints.md「日記の下書き・入力はオフラインでも継続可能とする」）。
// 単一デバイス・単一進行中下書きの前提のため uid スコープはしない（他のリポジトリ層と異なる）。
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      ...initialDraft,
      hasHydrated: false,
      setMood: (mood) => set({ mood }),
      setEventWord: (text, source = 'selected') =>
        set((state) => {
          const withoutEvent = state.words.filter((w) => w.category !== 'event');
          if (!text) return { words: withoutEvent };
          return { words: [...withoutEvent, { text, category: 'event', source }] };
        }),
      addWord: (word) =>
        set((state) => {
          if (state.words.some((w) => w.text === word.text)) return state;
          return { words: [...state.words, word] };
        }),
      removeWord: (text) => set((state) => ({ words: state.words.filter((w) => w.text !== text) })),
      setBodyText: (bodyText) => set({ bodyText }),
      setMoodLevel: (moodLevel) => set({ moodLevel }),
      setAwareness: (awareness) => set({ awareness }),
      reset: () => set({ ...initialDraft }),
    }),
    {
      name: DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      // アクション（関数）は永続化不要。DiaryDraft のデータフィールドのみ保存する。
      partialize: (state) => ({
        mood: state.mood,
        words: state.words,
        bodyText: state.bodyText,
        moodLevel: state.moodLevel,
        awareness: state.awareness,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          // 復元失敗時も空の下書きとして継続（クラッシュさせない）。
          console.warn('[draftStore] 下書きの復元に失敗しました', error);
        }
        useDraftStore.setState({ hasHydrated: true });
      },
    },
  ),
);
