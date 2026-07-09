import { ApiError } from './types';
import type { LlmCallOptions, LlmHistoryEntry, LlmProvider, LlmPurpose } from './types';

// Gemini Developer API 実装（LlmProvider）。
// - API キーは Worker の Secret（GEMINI_API_KEY, `wrangler secret put`）にのみ保持。クライアントには渡さない。
// - モデルは用途別（interactive/generate）。環境変数で差し替え可能（environments.md）。
// - 送受信ペイロード・日記本文はログに残さない（api-contract.md 第8章）。ログはメタ情報のみ。
// - 別プロバイダへ移管する場合は、本ファイルと同じく LlmProvider を満たす実装を追加し、
//   llm/index.ts の getLlmProvider に分岐を足すだけでよい（index.ts の変更は不要）。

// 本プロバイダが参照する環境変数（Worker Secret / vars）。
export interface GeminiEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL_INTERACTIVE?: string;
  GEMINI_MODEL_GENERATE?: string;
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini 呼び出しのタイムアウト（api-contract.md 第7章: 上限を設けて deadline-exceeded を制御）。
const REQUEST_TIMEOUT_MS = 25_000;

// 用途別モデル（無料枠で利用可能な Gemini 2.5/3.x 系の安定版）を env から解決する。
function resolveModel(env: GeminiEnv, purpose: LlmPurpose): string {
  if (purpose === 'generate') {
    return env.GEMINI_MODEL_GENERATE || 'gemini-3.5-flash';
  }
  return env.GEMINI_MODEL_INTERACTIVE || 'gemini-3.1-flash-lite';
}

// プロバイダ非依存ロール（user/assistant）→ Gemini のロール（user/model）へ写像。
function toGeminiRole(role: LlmHistoryEntry['role']): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
}
interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

// Gemini の HTTP エラーレスポンスを api-contract.md 1.4 のエラーコードへ写像。
async function mapGeminiError(response: Response): Promise<ApiError> {
  const status = response.status;
  let body: GeminiErrorBody = {};
  try {
    body = (await response.json()) as GeminiErrorBody;
  } catch {
    // JSON でないレスポンスは無視（ステータスのみで判定）。
  }

  if (status === 429) {
    return new ApiError(429, 'resource-exhausted', '混み合っています。少し待って再度お試しください。');
  }
  if (status === 400) {
    return new ApiError(400, 'invalid-argument', '入力内容を確認してください。');
  }
  if (status === 401 || status === 403) {
    console.error('Gemini auth error', status, body.error?.status);
    return new ApiError(500, 'internal', 'サーバ設定エラーが発生しました。');
  }
  if (status >= 500) {
    return new ApiError(503, 'unavailable', '一時的に応答できませんでした。再度お試しください。');
  }
  console.error('Unexpected Gemini error', status, body.error?.status);
  return new ApiError(500, 'internal', '想定外のエラーが発生しました。');
}

// 応答テキスト（candidates[0] の text パーツ連結）を取り出す。
function extractText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}

// Gemini を1往復呼び出す共通処理。生成のみで保存はしない（責務分離）。
async function callGemini(env: GeminiEnv, opts: LlmCallOptions): Promise<GeminiResponse> {
  if (!env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set');
    throw new ApiError(500, 'internal', 'サーバ設定エラーが発生しました。');
  }

  const contents = [
    ...(opts.history ?? []).map((h) => ({ role: toGeminiRole(h.role), parts: [{ text: h.text }] })),
    { role: 'user' as const, parts: [{ text: opts.userText }] },
  ];

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens ?? 1024,
  };
  if (opts.jsonSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = opts.jsonSchema;
  }

  const body = {
    contents,
    systemInstruction: { parts: [{ text: opts.system }] },
    generationConfig,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${resolveModel(env, opts.purpose)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(504, 'deadline-exceeded', '応答に時間がかかりすぎたため中断しました。再度お試しください。');
    }
    throw new ApiError(503, 'unavailable', 'ネットワークエラーが発生しました。再度お試しください。');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw await mapGeminiError(response);
  }

  return (await response.json()) as GeminiResponse;
}

// GeminiEnv から LlmProvider を生成する（fetch ベースのためクライアントキャッシュは不要）。
export function createGeminiProvider(env: GeminiEnv): LlmProvider {
  return {
    name: 'gemini',
    async callText(opts) {
      const response = await callGemini(env, opts);
      const text = extractText(response);
      if (!text) {
        throw new ApiError(503, 'unavailable', '応答の生成に失敗しました。再度お試しください。');
      }
      return text;
    },
    async callJson<T>(opts: LlmCallOptions): Promise<T> {
      const response = await callGemini(env, opts);
      const text = extractText(response);
      try {
        return JSON.parse(text) as T;
      } catch {
        // responseSchema 指定時は基本 JSON だが、念のため防御。
        throw new ApiError(503, 'unavailable', '応答の解析に失敗しました。再度お試しください。');
      }
    },
  };
}
