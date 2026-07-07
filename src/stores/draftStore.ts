import { create } from 'zustand';

import type { DiaryDraft, DiaryWord } from '../types/diary';
import type { MoodLevel } from '../theme/colors';

interface DraftState extends DiaryDraft {
  setMood: (mood: string) => void;
  addWord: (word: DiaryWord) => void;
  removeWord: (text: string) => void;
  setBodyText: (bodyText: string) => void;
  setMoodLevel: (level: MoodLevel | null) => void;
  setAwareness: (awareness: string) => void;
  reset: () => void;
}

const initialDraft: DiaryDraft = {
  words: [],
};

// 4ステップ日記フローの下書き状態（architecture.md 第4.2節 draftStore）。
// TODO(実装): オフライン継続のため storage 抽象へ永続化する（services/storage）。
export const useDraftStore = create<DraftState>((set) => ({
  ...initialDraft,
  setMood: (mood) => set({ mood }),
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
