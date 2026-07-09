// Gemini Developer API 連携（api-contract.md 第2章の設計を踏襲、LLM プロバイダは Gemini に変更）。
// - 無料枠での運用を優先し、Anthropic（Claude）から Google Gemini API へ切替（ユーザー判断）。
// - API キーは Worker の Secret（GEMINI_API_KEY, `wrangler secret put`）にのみ保持。クライアントには渡さない。
// - モデルは用途別（interactive=軽量・高速 / generate=品質重視）。環境変数で差し替え可能（environments.md）。
// - 送受信ペイロード・日記本文はログに残さない（api-contract.md 第8章）。ログはメタ情報のみ。
// - 将来 Anthropic に戻す場合は、本ファイル（呼び出し実装）のみを差し替えれば良い設計にしている
//   （index.ts 側は callText/callJson/modelInteractive/modelGenerate という同じ関数名で利用する）。

export interface Env {
  GEMINI_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  GEMINI_MODEL_INTERACTIVE?: string;
  GEMINI_MODEL_GENERATE?: string;
}

// api-contract.md 1.4 のエラーコードに準拠した HTTP エラー。
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | 'invalid-argument'
      | 'unauthenticated'
      | 'resource-exhausted'
      | 'unavailable'
      | 'deadline-exceeded'
      | 'internal',
    message: string,
  ) {
    super(message);
  }
}

// 用途別モデル（無料枠で利用可能な Gemini 2.5/3.x 系の安定版）。
// interactive: 連想語提案 / 調整 / 対話（低遅延・低コスト優先）
// generate:    日記文生成（品質優先）
export function modelInteractive(env: Env): string {
  return env.GEMINI_MODEL_INTERACTIVE || 'gemini-3.1-flash-lite';
}

export function modelGenerate(env: Env): string {
  return env.GEMINI_MODEL_GENERATE || 'gemini-3.5-flash';
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini 呼び出しのタイムアウト（api-contract.md 第7章: 上限を設けて deadline-exceeded を制御）。
const REQUEST_TIMEOUT_MS = 25_000;

// Gemini の対話履歴ロール（user / model）。api-contract.md の ai/me はこちらで写像する（index.ts）。
export interface GeminiHistoryEntry {
  role: 'user' | 'model';
  text: string;
}

export interface CallOptions {
  model: string;
  system: string;
  userText: string;
  history?: GeminiHistoryEntry[];
  maxTokens?: number;
  // Gemini の構造化出力（responseSchema）。JSON Schema のサブセット（additionalProperties 非対応、
  // nullable は type 配列 ["string","null"] で表現）。
  jsonSchema?: Record<string, unknown>;
}

interface GeminiPart {
  text: string;
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
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
async function call(env: Env, opts: CallOptions): Promise<GeminiResponse> {
  if (!env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set');
    throw new ApiError(500, 'internal', 'サーバ設定エラーが発生しました。');
  }

  const contents: GeminiContent[] = [
    ...(opts.history ?? []).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
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
    response = await fetch(`${API_BASE}/${opts.model}:generateContent`, {
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

// テキスト応答を返す（chat / chatOpening 用）。
export async function callText(env: Env, opts: CallOptions): Promise<string> {
  const response = await call(env, opts);
  const text = extractText(response);
  if (!text) {
    throw new ApiError(503, 'unavailable', '応答の生成に失敗しました。再度お試しください。');
  }
  return text;
}

// 構造化 JSON 応答をパースして返す（suggestWords / generateDiary / adjustDiary 用）。
export async function callJson<T>(env: Env, opts: CallOptions): Promise<T> {
  const response = await call(env, opts);
  const text = extractText(response);
  try {
    return JSON.parse(text) as T;
  } catch {
    // responseSchema 指定時は基本 JSON だが、念のため防御。
    throw new ApiError(503, 'unavailable', '応答の解析に失敗しました。再度お試しください。');
  }
}
