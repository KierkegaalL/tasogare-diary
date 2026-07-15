import { useQuery } from '@tanstack/react-query';

import { suggestWords } from '../services/diaryApi';
import type { SuggestWordsRequest } from '../services/diaryApi';

// 連想語提案（ことば / screen.md 3.4）。ローディング/エラー/再試行は TanStack Query に委譲。
export function useSuggestWords(req: SuggestWordsRequest, enabled = true) {
  return useQuery({
    queryKey: ['suggestWords', req.mood, req.events, req.selected],
    queryFn: () => suggestWords(req),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
