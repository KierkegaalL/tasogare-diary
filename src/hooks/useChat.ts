import { useMutation } from '@tanstack/react-query';

import { chat } from '../services/diaryApi';
import type { ChatRequest } from '../services/diaryApi';

// AI対話（詳細画面 / screen.md 3.8, api-contract.md 3.4）。
export function useChat() {
  return useMutation({
    mutationFn: (req: ChatRequest) => chat(req),
  });
}
