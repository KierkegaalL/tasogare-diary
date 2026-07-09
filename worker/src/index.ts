import { verifyFirebaseIdToken, AuthError } from './auth';
import { ApiError, getLlmProvider } from './llm';
import type { LlmHistoryEntry, LlmProvider } from './llm';
import type { Env } from './env';
import {
  PROMPT_VERSION,
  SYSTEM_ADJUST_DIARY,
  SYSTEM_CHAT,
  SYSTEM_CHAT_OPENING,
  SYSTEM_GENERATE_DIARY,
  SYSTEM_SUGGEST_WORDS,
} from './prompts';

// たそがれ日記 AI連携プロキシ（Cloudflare Workers 版）。
// Firebase Blaze プランを使わず、Spark プラン（Firestore/Auth のみ）を維持するための構成。
// - クライアントは Firebase ID トークンを Authorization: Bearer で送る。
// - 本 Worker がトークンを検証（jose + Google 公開鍵）→ LLM プロバイダを呼び出す。
// - API キーはクライアントに埋め込まず、Worker の Secret にのみ保持（constraints.md）。
// 注: LLM プロバイダは抽象化されており（./llm）、現在の実装は無料枠運用のため Gemini。
//     別 API（Anthropic 等）へ移管する場合は ./llm 配下にプロバイダ実装を追加するだけで、
//     本ファイル（ルーティング/バリデーション/プロンプト）は変更不要。

// ---- 型（api-contract.md 第3章。クライアント src/services/diaryApi.ts と対応）----
type MoodLevel = 'calm' | 'tender' | 'heavy';
type WordCategory = 'mood' | 'event' | 'assoc';
type ChatRole = 'ai' | 'me';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return json({ error: { code: 'unauthenticated', message: err.message } }, 401);
  }
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('Unhandled error', (err as Error)?.name);
  return json({ error: { code: 'internal', message: '想定外のエラーが発生しました。' } }, 500);
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ApiError(400, 'invalid-argument', `${field} は文字列配列である必要があります。`);
  }
  return value as string[];
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'invalid-argument', `${field} は必須です。`);
  }
  return value;
}

// `as const` のリテラル型スキーマを LlmCallOptions.jsonSchema（Record<string, unknown>）へ渡すための
// 型ヘルパー（二重キャストの重複を1箇所に集約）。スキーマ規約は llm/types.ts を参照。
function schema(s: unknown): Record<string, unknown> {
  return s as Record<string, unknown>;
}

// ai/me（保存モデル）→ プロバイダ非依存ロール assistant/user へ写像（api-contract.md 第2章）。
// 各プロバイダが自社のロール名（例: Gemini は model/user）へ再写像する。
function toLlmHistory(history: { role: ChatRole; text: string }[]): LlmHistoryEntry[] {
  return history
    .filter((m) => typeof m?.text === 'string' && m.text.length > 0)
    .map((m) => ({
      role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
      text: m.text,
    }));
}

// ==========================================================================
// 3.1 suggestWords — 連想語提案
// ==========================================================================
const SUGGEST_WORDS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          category: { type: 'string', enum: ['mood', 'event', 'assoc'] },
        },
        required: ['text', 'category'],
      },
    },
  },
  required: ['suggestions'],
} as const;

async function handleSuggestWords(llm: LlmProvider, data: Record<string, unknown>) {
  const events = asStringArray(data.events ?? [], 'events');
  const selected = asStringArray(data.selected ?? [], 'selected');
  const mood = typeof data.mood === 'string' ? data.mood : undefined;

  const userText = JSON.stringify({
    mood: mood ?? null,
    moodEnumHint: typeof data.moodEnumHint === 'string' ? data.moodEnumHint : null,
    events,
    selected,
    instruction: '上記をふまえ、日記のきっかけになる連想語を最大7語、重複なく提案してください。',
  });

  const parsed = await llm.callJson<{ suggestions: { text: string; category: WordCategory }[] }>({
    purpose: 'interactive',
    system: SYSTEM_SUGGEST_WORDS,
    userText,
    maxTokens: 512,
    jsonSchema: schema(SUGGEST_WORDS_SCHEMA),
  });

  return { suggestions: parsed.suggestions ?? [], promptVersion: PROMPT_VERSION.suggestWords };
}

// ==========================================================================
// 3.2 generateDiary — 日記文生成
// ==========================================================================
const GENERATE_DIARY_SCHEMA = {
  type: 'object',
  properties: {
    bodyText: { type: 'string' },
    // nullable は OpenAPI 3.0 風の `nullable: true` で表現する（llm/types.ts のスキーマ規約）。
    // 各プロバイダが自社の構造化出力形式へ変換する（Gemini はそのまま responseSchema に渡せる）。
    mood: { type: 'string', enum: ['calm', 'tender', 'heavy'], nullable: true },
  },
  required: ['bodyText', 'mood'],
} as const;

async function handleGenerateDiary(llm: LlmProvider, data: Record<string, unknown>) {
  const words = data.words;
  if (!Array.isArray(words) || words.length === 0) {
    throw new ApiError(400, 'invalid-argument', 'words は必須です。');
  }
  const date = requireString(data.date, 'date');

  const userText = JSON.stringify({
    words,
    date,
    instruction: '上記の言葉から日記本文（2〜3文）と感情ラベルを生成してください。',
  });

  const parsed = await llm.callJson<{ bodyText: string; mood: MoodLevel | null }>({
    purpose: 'generate',
    system: SYSTEM_GENERATE_DIARY,
    userText,
    maxTokens: 1024,
    jsonSchema: schema(GENERATE_DIARY_SCHEMA),
  });

  return {
    bodyText: parsed.bodyText ?? '',
    mood: parsed.mood ?? null,
    promptVersion: PROMPT_VERSION.generateDiary,
  };
}

// ==========================================================================
// 3.3 adjustDiary — 調整・再生成
// ==========================================================================
type AdjustInstruction = 'positive' | 'shorter' | 'detailed';

const ADJUST_DIARY_SCHEMA = {
  type: 'object',
  properties: { bodyText: { type: 'string' } },
  required: ['bodyText'],
} as const;

async function handleAdjustDiary(llm: LlmProvider, data: Record<string, unknown>) {
  const bodyText = requireString(data.bodyText, 'bodyText');
  const instruction = data.instruction as AdjustInstruction;
  if (!['positive', 'shorter', 'detailed'].includes(instruction)) {
    throw new ApiError(400, 'invalid-argument', 'instruction が不正です。');
  }

  const label =
    instruction === 'positive' ? 'もっと前向きに' : instruction === 'shorter' ? '短く' : '詳しく';
  const userText = JSON.stringify({
    bodyText,
    instruction,
    request: `次の日記本文を「${label}」書き直してください。`,
  });

  const parsed = await llm.callJson<{ bodyText: string }>({
    purpose: 'interactive',
    system: SYSTEM_ADJUST_DIARY,
    userText,
    maxTokens: 1024,
    jsonSchema: schema(ADJUST_DIARY_SCHEMA),
  });

  // mood は調整では再推定しない（クライアントが既存の mood を維持する）。
  return { bodyText: parsed.bodyText ?? bodyText, mood: null, promptVersion: PROMPT_VERSION.adjustDiary };
}

// ==========================================================================
// 3.4 chat — AI対話
// ==========================================================================
async function handleChat(llm: LlmProvider, data: Record<string, unknown>) {
  const message = requireString(data.message, 'message');
  const rawHistory = Array.isArray(data.history) ? data.history : [];
  const history = toLlmHistory(rawHistory as { role: ChatRole; text: string }[]);

  // 注: 当該エントリ本文・過去要約のサーバ補完（api-contract.md 3.4 備考）は将来対応。
  // 現段階はクライアントから渡る直近履歴＋メッセージのみを最小送信する（第8章）。
  const reply = await llm.callText({
    purpose: 'interactive',
    system: SYSTEM_CHAT,
    history,
    userText: message,
    maxTokens: 512,
  });

  return { reply, promptVersion: PROMPT_VERSION.chat };
}

// ==========================================================================
// 3.4 chatOpening — 初回問いかけ
// ==========================================================================
async function handleChatOpening(llm: LlmProvider, data: Record<string, unknown>) {
  const mood = typeof data.mood === 'string' ? data.mood : null;
  const bodyText = typeof data.bodyText === 'string' ? data.bodyText : '';

  const userText = JSON.stringify({
    mood,
    bodyText,
    instruction: 'この日のエントリをふまえ、対話の最初の問いかけを1〜2文で生成してください。',
  });

  const reply = await llm.callText({
    purpose: 'interactive',
    system: SYSTEM_CHAT_OPENING,
    userText,
    maxTokens: 256,
  });

  return { reply, promptVersion: PROMPT_VERSION.chatOpening };
}

const ROUTES: Record<string, (llm: LlmProvider, data: Record<string, unknown>) => Promise<unknown>> = {
  '/suggestWords': handleSuggestWords,
  '/generateDiary': handleGenerateDiary,
  '/adjustDiary': handleAdjustDiary,
  '/chat': handleChat,
  '/chatOpening': handleChatOpening,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (!handler) {
      return json({ error: { code: 'internal', message: 'not found' } }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: { code: 'invalid-argument', message: 'POST のみ対応しています。' } }, 405);
    }

    try {
      const uid = await verifyFirebaseIdToken(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID);
      void uid; // 現段階は認証（uid 確立）のみ利用。将来 wordStats 等の uid スコープ処理に使う。

      let data: Record<string, unknown>;
      try {
        data = ((await request.json()) ?? {}) as Record<string, unknown>;
      } catch {
        throw new ApiError(400, 'invalid-argument', 'リクエスト本文が不正な JSON です。');
      }

      const llm = getLlmProvider(env);
      const result = await handler(llm, data);
      return json(result);
    } catch (err) {
      return errorResponse(err);
    }
  },
};
