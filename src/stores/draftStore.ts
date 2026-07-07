import { create } from 'zustand';

import type { DiaryDraft, DiaryWord, WordSource } from '../types/diary';
import type { MoodLevel } from '../theme/colors';

interface DraftState extends DiaryDraft {
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

// 4ステップ日記フローの下書き状態（architecture.md 第4.2節 draftStore）。
// TODO(実装): オフライン継続のため storage 抽象へ永続化する（services/storage）。
export const useDraftStore = create<DraftState>((set) => ({
  ...initialDraft,
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
}));
