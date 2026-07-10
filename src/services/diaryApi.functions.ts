import type {
  AdjustDiaryRequest,
  AdjustDiaryResponse,
  ChatRequest,
  ChatResponse,
  GenerateDiaryRequest,
  GenerateDiaryResponse,
  GenerateInsightRequest,
  GenerateInsightResponse,
  SuggestWordsRequest,
  SuggestWordsResponse,
} from './diaryApi';
import type { MoodLevel } from '../theme/colors';
import { callClaudeWorker } from './claudeWorker/client';

// Claude 連携（api-contract.md 第3章）の **Cloudflare Worker 実装**。
// Firebase 設定時（isFirebaseConfigured=true）に diaryApi.ts から使う。
// Firebase Blaze プランを使わず Spark プランを維持するため、Firebase Functions ではなく
// Cloudflare Workers 上のプロキシ（worker/src/index.ts）を Firebase ID トークン付きで呼ぶ。
// API キーはクライアントに持たない（constraints.md）。

export async function suggestWords(req: SuggestWordsRequest): Promise<SuggestWordsResponse> {
  return callClaudeWorker<SuggestWordsRequest, SuggestWordsResponse>('/suggestWords', req);
}

export async function generateDiary(req: GenerateDiaryRequest): Promise<GenerateDiaryResponse> {
  return callClaudeWorker<GenerateDiaryRequest, GenerateDiaryResponse>('/generateDiary', req);
}

export async function adjustDiary(req: AdjustDiaryRequest): Promise<AdjustDiaryResponse> {
  return callClaudeWorker<AdjustDiaryRequest, AdjustDiaryResponse>('/adjustDiary', req);
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  return callClaudeWorker<ChatRequest, ChatResponse>('/chat', req);
}

export async function chatOpening(ctx: {
  mood: MoodLevel | null;
  bodyText: string;
}): Promise<ChatResponse> {
  return callClaudeWorker<{ mood: MoodLevel | null; bodyText: string }, ChatResponse>(
    '/chatOpening',
    ctx,
  );
}

export async function generateInsight(req: GenerateInsightRequest): Promise<GenerateInsightResponse> {
  return callClaudeWorker<GenerateInsightRequest, GenerateInsightResponse>('/generateInsight', req);
}
