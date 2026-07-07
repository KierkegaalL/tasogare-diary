import { useMutation, useQuery } from '@tanstack/react-query';

import { adjustDiary, generateDiary } from '../services/diaryApi';
import type { AdjustInstruction } from '../services/diaryApi';
import type { DiaryWord } from '../types/diary';

// 日記文生成（たしかめる / screen.md 3.5, api-contract.md 3.2）。
// 生成は入室時に1回。再生成は「選び直す」（画面再訪）や「調整」（useAdjustDiary）で行う。
export function useGenerateDiary(words: DiaryWord[], date: string, enabled: boolean) {
  const key = words.map((w) => `${w.category}:${w.text}`).join('|');
  return useQuery({
    queryKey: ['generateDiary', key, date],
    queryFn: () => generateDiary({ words, date, locale: 'ja' }),
    enabled: enabled && words.length > 0,
    staleTime: Infinity,
    retry: 1,
  });
}

// 本文の調整・再生成（api-contract.md 3.3）。
export function useAdjustDiary() {
  return useMutation({
    mutationFn: (input: { bodyText: string; instruction: AdjustInstruction }) =>
      adjustDiary({ ...input, locale: 'ja' }),
  });
}
