import { ApiError } from './types';
import type { LlmProvider } from './types';
import { createGeminiProvider } from './gemini';
import type { GeminiEnv } from './gemini';

// LLM プロバイダのセレクタ。環境変数 LLM_PROVIDER で切り替える（既定: gemini）。
// 別プロバイダへ移管する場合は (1) llm/<provider>.ts に LlmProvider 実装を追加し、
// (2) 下記 switch に分岐を足すだけでよい。index.ts（ルーティング/バリデーション/プロンプト）は変更不要。

export type { LlmProvider, LlmCallOptions, LlmHistoryEntry, LlmPurpose, LlmRole, ApiErrorCode } from './types';
export { ApiError } from './types';

// セレクタが参照する環境変数。各プロバイダの env を内包する。
export interface LlmEnv extends GeminiEnv {
  LLM_PROVIDER?: string;
}

export function getLlmProvider(env: LlmEnv): LlmProvider {
  const name = (env.LLM_PROVIDER || 'gemini').toLowerCase();
  switch (name) {
    case 'gemini':
      return createGeminiProvider(env);
    // 例: 将来 Anthropic を追加する場合
    // case 'anthropic':
    //   return createAnthropicProvider(env);
    default:
      throw new ApiError(500, 'internal', `未対応の LLM プロバイダです: ${name}`);
  }
}
